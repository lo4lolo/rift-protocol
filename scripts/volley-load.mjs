import { WebSocket } from "ws";
import { createServer } from "../server.mjs";
import { reportDate } from "./report-time.mjs";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 200 && !fn(); i++) await wait(10);
  assert.ok(fn(), "volley condition timed out");
}
const app = createServer({ port: 0, host: "127.0.0.1" }),
  clients = [],
  runs = [];
try {
  const { port } = await app.listen();
  for (let i = 0; i < 10; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`),
      c = { ws, id: null, seq: 0, state: null, events: [], bytes: 0 };
    clients.push(c);
    ws.on("message", (raw) => {
      c.bytes += raw.length;
      const m = JSON.parse(raw);
      if (m.type === "welcome") c.id = m.id;
      if (m.type === "state") {
        c.state = m.state;
        c.events.push(...m.state.events);
      }
    });
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    ws.send(JSON.stringify({ type: "join", code: "VOLLEY", name: `Test${i}` }));
  }
  await until(() => clients.every((c) => c.id));
  const g = app.rooms.get("VOLLEY");
  g.start(clients[0].id);
  for (const [weapon, bullets, ammo] of [
    ["shotgun", 10, 5],
    ["burstRifle", 3, 21],
  ]) {
    g.phase = "buy";
    g.end = g.time + 100;
    for (const c of clients) {
      const p = g.players.get(c.id);
      p.credits = 9000;
      assert.equal(g.buy(c.id, weapon), true);
      p.input = {};
      p.triggerHeld = false;
      c.events = [];
      c.bytes = 0;
    }
    await wait(900);
    g.phase = "live";
    g.end = g.time + 100;
    const eventStart = g.eventId;
    for (const c of clients)
      c.ws.send(
        JSON.stringify({
          type: "input",
          seq: ++c.seq,
          round: g.round,
          yaw: 0,
          pitch: 1.45,
          fire: true,
          firePressed: true,
        }),
      );
    const ownShots = (c) =>
      c.events.filter(
        (e) => e.type === "shot" && e.player === c.id && e.id > eventStart,
      );
    await until(() =>
      clients.every(
        (c) =>
          ownShots(c).length >= bullets &&
          c.state?.players.find((p) => p.id === c.id)?.ammo === ammo,
      ),
    );
    await wait(200);
    for (const c of clients) {
      assert.equal(c.ws.readyState, 1);
      assert.equal(ownShots(c).length, bullets);
      assert.equal(
        new Set(c.events.map((e) => e.id)).size,
        c.events.length,
        "duplicate event delivery",
      );
      assert.equal(g.players.get(c.id).ammo, ammo);
      assert.equal(g.players.get(c.id).hp, 100);
      assert.ok(c.state.players.every((p) => !("queuedBurst" in p)));
    }
    const emitted = g.events.filter(
      (e) => e.id > eventStart && e.type === "shot",
    );
    assert.equal(emitted.length, bullets * 10);
    runs.push({
      weapon,
      clients: 10,
      serverShots: emitted.length,
      receivedOwnShots: clients.reduce((n, c) => n + ownShots(c).length, 0),
      remainingAmmo: ammo,
      averageBytes: Math.round(clients.reduce((n, c) => n + c.bytes, 0) / 10),
    });
  }
  const result = {
    date: reportDate(),
    runs,
    note: "10 local sockets; server equips fixtures, clients trigger upward volleys; no browser or rendering",
  };
  await writeFile("evidence/volley-load.json", JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  for (const c of clients) c.ws.close();
  await app.close();
}
