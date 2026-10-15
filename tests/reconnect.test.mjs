import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createServer } from "../server.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 100 && !fn(); i++) await wait(10);
  assert.ok(fn(), "condition timed out");
}
async function join(port, code, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`),
    messages = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw)));
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  ws.send(
    JSON.stringify({ type: "join", code, name: "Tester", resumeToken: token }),
  );
  await until(() =>
    messages.some((m) => m.type === "welcome" || m.type === "error"),
  );
  return {
    ws,
    messages,
    welcome: messages.find((m) => m.type === "welcome"),
    error: messages.find((m) => m.type === "error"),
  };
}
test("real socket resumes identity, inventory and sequence without leaking its secret to peers", async () => {
  const app = createServer({
      port: 0,
      host: "127.0.0.1",
      reconnectGraceMs: 2000,
    }),
    { port } = await app.listen();
  try {
    const a = await join(port, "RESUME"),
      b = await join(port, "RESUME"),
      g = app.rooms.get("RESUME"),
      p = g.players.get(a.welcome.id);
    g.start(p.id);
    assert.equal(p.awaitingSpawn, false);
    g.phase = "live";
    Object.assign(p, {
      hp: 65,
      credits: 3456,
      ammo: 7,
      lastShot: g.time,
      seq: 45,
      x: -18,
      z: 0,
      input: { fire: true, w: true },
    });
    a.ws.close();
    await until(() => p.connected === false);
    assert.equal(g.owner, b.welcome.id);
    // trigger() may have already written released button flags during a tick.
    assert.ok(Object.values(p.input).every((value) => value === false));
    assert.deepEqual(p.commands, []);
    assert.equal(g.spike.carrier, null);
    const frozenZ = p.z;
    await wait(280);
    assert.equal(p.ammo, 7);
    assert.equal(p.z, frozenZ);
    const resumed = await join(port, "RESUME", a.welcome.resumeToken);
    assert.equal(resumed.welcome.id, p.id);
    assert.equal(resumed.welcome.resumed, true);
    assert.equal(resumed.welcome.seq, 45);
    assert.equal(p.hp, 65);
    assert.equal(p.credits, 3456);
    assert.equal(p.ammo, 7);
    assert.equal(p.z, frozenZ);
    assert.equal(g.players.size, 2);
    assert.equal(p.connected, true);
    resumed.ws.send(
      JSON.stringify({
        type: "input",
        round: g.round,
        seq: 46,
        yaw: 0,
        pitch: 0,
        w: true,
      }),
    );
    await until(() => p.ack === 46);
    assert.ok(p.z < frozenZ);
    await until(() => b.messages.some((m) => m.type === "state"));
    assert.equal(
      JSON.stringify(b.messages).includes(a.welcome.resumeToken),
      false,
    );
    const active = await join(port, "RESUME", a.welcome.resumeToken);
    assert.equal(active.error.reason, "resume_active");
    const wrongRoom = await join(port, "OTHER", a.welcome.resumeToken);
    assert.equal(wrongRoom.error.reason, "resume_expired");
  } finally {
    await app.close();
  }
});
test("grace expiry removes reserved players and empty rooms; expired token cannot revive old identity", async () => {
  const app = createServer({
      port: 0,
      host: "127.0.0.1",
      reconnectGraceMs: 60,
    }),
    { port } = await app.listen();
  try {
    const a = await join(port, "EXPIRE");
    a.ws.close();
    await until(() => !app.rooms.has("EXPIRE"));
    const expired = await join(port, "EXPIRE", a.welcome.resumeToken);
    assert.equal(expired.error.reason, "resume_expired");
    assert.equal(app.rooms.size, 0);
    const fresh = await join(port, "EXPIRE");
    assert.notEqual(fresh.welcome.id, a.welcome.id);
  } finally {
    await app.close();
  }
});
test("a full room reserves disconnected seat while allowing its valid session to return", async () => {
  const app = createServer({
      port: 0,
      host: "127.0.0.1",
      reconnectGraceMs: 2000,
    }),
    { port } = await app.listen();
  try {
    const a = await join(port, "FULL");
    const g = app.rooms.get("FULL");
    for (let i = 0; i < 9; i++) g.add("bot" + i, "Bot", "veil", true);
    g.start(a.welcome.id); // Active matches keep bot seats; lobby bots can yield to friends.
    a.ws.close();
    await until(() => g.players.get(a.welcome.id).connected === false);
    const stranger = await join(port, "FULL");
    assert.ok(stranger.error);
    assert.equal(g.players.size, 10);
    const resumed = await join(port, "FULL", a.welcome.resumeToken);
    assert.equal(resumed.welcome.id, a.welcome.id);
    assert.equal(g.owner, a.welcome.id);
  } finally {
    await app.close();
  }
});
