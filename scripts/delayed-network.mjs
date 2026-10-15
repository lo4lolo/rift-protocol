import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { WebSocket } from "ws";
import { createServer } from "../server.mjs";
import { motionState, simulateCommand, reconcile } from "../netcode.mjs";
import { movementSpeed } from "../shared.mjs";
import { createLatencyProxy } from "./latency-proxy.mjs";
import { reportDate } from "./report-time.mjs";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition, label) {
  const deadline = performance.now() + 8000;
  while (!condition()) {
    assert.ok(performance.now() < deadline, `Timeout: ${label}`);
    await sleep(10);
  }
}
const app = createServer({ port: 0, host: "127.0.0.1" });
const { port } = await app.listen();
let proxy;
const clients = [];
try {
  proxy = await createLatencyProxy(port, { delayMs: 100, jitterMs: 25 });
  for (const name of ["DelayedA", "DelayedB"]) {
    const c = {
      ws: new WebSocket(`ws://127.0.0.1:${proxy.port}`),
      id: null,
      seq: 0,
      pending: [],
      local: null,
      state: null,
      round: -1,
      snapshots: 0,
      maxCorrection: 0,
      taggedSnapshots: 0,
      sawPing: false,
      rtts: [],
    };
    clients.push(c);
    c.ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.type === "pong") c.rtts.push(performance.now() - m.stamp);
      if (m.type === "welcome") c.id = m.id;
      if (m.type !== "state" || !c.id) return;
      const self = m.state.players.find((p) => p.id === c.id);
      if (!self) return;
      c.snapshots++;
      if (self.slow > 0) c.taggedSnapshots++;
      if (m.state.pings.length) c.sawPing = true;
      if (c.round !== m.state.round) {
        c.pending = [];
        c.local = motionState(self);
        c.round = m.state.round;
      } else {
        const result = reconcile(self, c.pending, m.state.phase);
        if (c.state?.phase === "live" && m.state.phase === "live")
          c.maxCorrection = Math.max(
            c.maxCorrection,
            Math.hypot(
              c.local.x - result.predicted.x,
              c.local.z - result.predicted.z,
            ),
          );
        c.local = result.predicted;
        c.pending = result.pending;
      }
      c.state = m.state;
    });
    await new Promise((resolve, reject) => {
      c.ws.once("open", resolve);
      c.ws.once("error", reject);
    });
    c.ws.send(JSON.stringify({ type: "join", code: "DELAY", name }));
  }
  await until(() => clients.every((c) => c.state && c.id), "join");
  const [a, b] = clients,
    g = app.rooms.get("DELAY");
  g.cfg.buy = 0.05;
  a.ws.send(JSON.stringify({ type: "start" }));
  await until(
    () => clients.every((c) => c.state.phase === "live"),
    "live snapshots",
  );
  // Fixture positions are set inside this test-owned server, never via a debug endpoint.
  Object.assign(g.players.get(a.id), { x: -18, z: 24 });
  await sleep(350);
  a.maxCorrection = 0;
  for (let i = 0; i < 100; i++) {
    const command = {
      type: "input",
      seq: ++a.seq,
      round: g.round,
      yaw: 0,
      pitch: -0.3,
      w: i < 80,
      altPressed: i === 80,
      viewTime: a.state.time - 0.1,
    };
    simulateCommand(a.local, command, a.state.phase);
    a.pending.push(command);
    a.ws.send(JSON.stringify(command));
    if (i === 25) g.damage(g.players.get(a.id), 1, g.players.get(b.id));
    if (i === 60) a.ws.send(JSON.stringify({ type: "mark" }));
    if (i % 20 === 0)
      a.ws.send(JSON.stringify({ type: "ping", stamp: performance.now() }));
    await sleep(1000 / 30);
  }
  await until(
    () => a.pending.length === 0 && g.players.get(a.id).ack === a.seq,
    "ack drain",
  );
  await sleep(350);
  const authoritative = g.players.get(a.id);
  const finalError = Math.hypot(
    a.local.x - authoritative.x,
    a.local.z - authoritative.z,
  );
  assert.ok(finalError < 0.002, `Final position error ${finalError}`);
  assert.ok(a.maxCorrection < 1, `Excessive correction ${a.maxCorrection}`);
  assert.ok(a.taggedSnapshots > 0, "delayed client never saw tagging");
  assert.equal(a.local.slow, 0);
  assert.equal(authoritative.ammo, 9);
  assert.equal(a.sawPing, true);
  assert.equal(b.sawPing, false);
  assert.equal(a.rtts.length, 5);
  assert.ok(Math.min(...a.rtts) >= 180, "proxy delay was not observed");
  assert.ok(clients.every((c) => c.snapshots >= 50 && c.ws.readyState === 1));
  const initialCorrection = a.maxCorrection;
  // Isolated corridor fixture; equipment changes themselves travel over the proxy.
  Object.assign(authoritative, { x: -18, z: 0, primary: "sniper" });
  await sleep(350);
  a.maxCorrection = 0;
  const weaponMovement = [];
  async function movementCommand(ads = false) {
    const command = {
      type: "input",
      seq: ++a.seq,
      round: g.round,
      yaw: 0,
      pitch: 0,
      w: true,
      ads,
      weapon: "knife",
      moveSpeed: 999,
    };
    simulateCommand(a.local, command, a.state.phase);
    a.pending.push(command);
    a.ws.send(JSON.stringify(command));
    await sleep(1000 / 30);
  }
  for (const [slot, weapon, ads] of [
    [3, "knife", false],
    [1, "sniper", true],
    [2, "pistol", false],
  ]) {
    a.ws.send(JSON.stringify({ type: "select", slot }));
    await until(
      () => authoritative.weapon === weapon && a.local.weapon === weapon,
      `equip ${weapon}`,
    );
    const start = authoritative.z;
    for (let i = 0; i < 18; i++) await movementCommand(ads);
    await until(
      () => authoritative.ack === a.seq && a.pending.length === 0,
      `${weapon} ack drain`,
    );
    const distance = start - authoritative.z;
    const expected = (movementSpeed(authoritative, { ads }) * 18) / 30;
    const error = Math.hypot(
      a.local.x - authoritative.x,
      a.local.z - authoritative.z,
    );
    assert.ok(
      Math.abs(distance - expected) < 0.002,
      `${weapon} distance ${distance} expected ${expected}`,
    );
    assert.ok(error < 0.002, `${weapon} final prediction ${error}`);
    weaponMovement.push({
      weapon,
      ads,
      distance: +distance.toFixed(4),
      expected: +expected.toFixed(4),
      finalError: +error.toFixed(6),
    });
  }
  for (let i = 0; i < 72; i++) {
    if (i % 18 === 0)
      a.ws.send(JSON.stringify({ type: "select", slot: [3, 1, 2, 3][i / 18] }));
    await movementCommand(i >= 18 && i < 36);
  }
  await until(
    () => authoritative.ack === a.seq && a.pending.length === 0,
    "moving weapon switch drain",
  );
  const switchError = Math.hypot(
    a.local.x - authoritative.x,
    a.local.z - authoritative.z,
  );
  assert.ok(
    switchError < 0.002,
    `Weapon switch final prediction ${switchError}`,
  );
  assert.ok(a.maxCorrection < 1, `Weapon switch correction ${a.maxCorrection}`);
  assert.equal(authoritative.weapon, "knife");
  const switchCorrection = a.maxCorrection;
  const oldRound = g.round;
  for (let i = 0; i < 5; i++)
    a.ws.send(
      JSON.stringify({
        type: "input",
        seq: ++a.seq,
        round: oldRound,
        yaw: 0,
        pitch: 0,
        w: true,
      }),
    );
  const acknowledgedBeforeTransition = authoritative.ack;
  g.nextRound();
  await until(() => a.state.round === g.round, "new round snapshot");
  assert.equal(authoritative.ack, acknowledgedBeforeTransition);
  assert.equal(a.pending.length, 0);
  const fresh = {
    type: "input",
    seq: ++a.seq,
    round: g.round,
    yaw: 0,
    pitch: 0,
    w: true,
  };
  simulateCommand(a.local, fresh, "buy");
  a.pending.push(fresh);
  a.ws.send(JSON.stringify(fresh));
  await until(
    () => authoritative.ack === a.seq && a.pending.length === 0,
    "new round command",
  );
  const result = {
    date: reportDate(),
    clients: 2,
    oneWayDelayMs: [100, 125],
    observedRoundTripMs: {
      min: +Math.min(...a.rtts).toFixed(1),
      max: +Math.max(...a.rtts).toFixed(1),
    },
    inputHz: 30,
    commands: a.seq,
    weaponMovement,
    movingSwitches: 4,
    movingSwitchErrorMeters: +switchError.toFixed(6),
    movingSwitchMaxCorrectionMeters: +switchCorrection.toFixed(4),
    staleCommandsRejected: 5,
    maxCorrectionMeters: +initialCorrection.toFixed(4),
    finalErrorMeters: +finalError.toFixed(6),
    taggedSnapshots: a.taggedSnapshots,
    minimumSnapshots: Math.min(...clients.map((c) => c.snapshots)),
    checks: [
      "all current-round commands acknowledged",
      "prediction converges",
      "tagging arrives and expires",
      "alternate consumes three bullets once",
      "team ping stays private",
      "knife, scoped sniper and pistol travel their authoritative distance despite forged input speed",
      "four equipment switches while moving converge after delayed ACKs",
      "old round in-flight commands rejected and new round input acknowledged",
    ],
    note: "Real delayed WebSockets with shared prediction code; no browser, rendering or mouse interaction",
  };
  await mkdir("evidence", { recursive: true });
  await writeFile(
    "evidence/delayed-network.json",
    JSON.stringify(result, null, 2),
  );
  console.log(result);
} finally {
  for (const c of clients) c.ws.terminate();
  await proxy?.close();
  await app.close();
}
