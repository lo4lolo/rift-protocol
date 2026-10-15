import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createServer } from "../server.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("friend replaces one lobby bot without removing humans or changing an active full match", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    const a = await connect(port, "BOTSEAT", "A");
    a.ws.send(JSON.stringify({ type: "bots" }));
    await wait(100);
    const g = app.rooms.get("BOTSEAT");
    assert.equal(g.players.size, 10);
    const b = await connect(port, "BOTSEAT", "B");
    assert.ok(b.id);
    assert.equal(g.players.size, 10);
    assert.equal([...g.players.values()].filter((p) => p.bot).length, 8);
    assert.equal(g.owner, a.id);
    assert.ok(g.players.has(a.id));
    assert.ok(g.players.has(b.id));
    assert.equal(g.players.get(b.id).alive, true);
    for (const team of [0, 1])
      assert.equal(
        [...g.players.values()].filter((p) => p.team === team).length,
        5,
      );
    g.start(a.id);
    const c = await connect(port, "BOTSEAT", "C");
    assert.equal(c.id, undefined);
    assert.ok(c.messages.some((m) => m.type === "error"));
    assert.equal(g.players.size, 10);
    assert.equal([...g.players.values()].filter((p) => p.bot).length, 8);
  } finally {
    await app.close();
  }
});

test("new live-room socket waits without awarding a free win and spawns next round", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    const a = await connect(port, "LATESOCKET", "A");
    const g = app.rooms.get("LATESOCKET");
    g.start(a.id);
    g.phase = "live";
    g.end = g.time + 100;
    const b = await connect(port, "LATESOCKET", "B");
    await wait(120);
    assert.equal(g.phase, "live");
    assert.deepEqual(g.score, [0, 0]);
    const own = b.messages
      .filter((m) => m.type === "state")
      .at(-1)
      .state.players.find((p) => p.id === b.id);
    assert.equal(own.awaitingSpawn, true);
    assert.equal(own.alive, false);
    g.nextRound();
    await wait(120);
    const next = b.messages
      .filter((m) => m.type === "state")
      .at(-1)
      .state.players.find((p) => p.id === b.id);
    assert.equal(next.awaitingSpawn, false);
    assert.equal(next.alive, true);
  } finally {
    await app.close();
  }
});

test("team chat uses socket identity, excludes enemies and other rooms, and throttles spam", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    const a = await connect(port, "CHAT1", "A"),
      b = await connect(port, "CHAT1", "B"),
      c = await connect(port, "CHAT1", "C"),
      d = await connect(port, "CHAT2", "D");
    a.ws.send(
      JSON.stringify({
        type: "chat",
        text: "<img src=x> 방어 준비",
        id: b.id,
        team: 1,
      }),
    );
    a.ws.send(JSON.stringify({ type: "chat", text: "spam" }));
    await wait(150);
    assert.deepEqual(
      a.messages.filter((m) => m.type === "chatAck").map((m) => m.accepted),
      [true, false],
    );
    for (const peer of [b, c, d])
      assert.equal(peer.messages.filter((m) => m.type === "chatAck").length, 0);
    const chats = (p) =>
      p.messages
        .flatMap((m) => m.state?.events || [])
        .filter((e) => e.type === "chat");
    for (const p of [a, c]) {
      assert.equal(chats(p).length, 1);
      assert.equal(chats(p)[0].name, "A");
      assert.equal(chats(p)[0].player, a.id);
      assert.equal(chats(p)[0].text, "<img src=x> 방어 준비");
      assert.ok(!("recipients" in chats(p)[0]));
    }
    assert.equal(chats(b).length, 0);
    assert.equal(chats(d).length, 0);
    const g = app.rooms.get("CHAT1");
    assert.equal(g.chat(a.id, {}), false);
    g.time += 2;
    assert.equal(g.chat(a.id, "\n\t"), false);
    assert.equal(g.chat(a.id, "X".repeat(400)), true);
    assert.equal(g.events.at(-1).text.length, 200);
    g.players.get(b.id).team = 0;
    assert.equal(
      g.snapshot(b.id).events.filter((e) => e.type === "chat").length,
      0,
    );
  } finally {
    await app.close();
  }
});
test("refund messages use socket identity and cannot choose credit amounts or duplicate receipts", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    const a = await connect(port, "REFUND1", "A"),
      b = await connect(port, "REFUND1", "B");
    const g = app.rooms.get("REFUND1");
    g.start(a.id);
    const p = g.players.get(a.id);
    p.credits = 9000;
    g.buy(a.id, "rifle");
    const paid = p.credits;
    b.ws.send(JSON.stringify({ type: "refundWeapon", id: a.id, amount: 9000 }));
    await wait(80);
    assert.equal(p.credits, paid);
    assert.equal(p.primary, "rifle");
    for (let i = 0; i < 2; i++)
      a.ws.send(JSON.stringify({ type: "refundWeapon", amount: 999999 }));
    await wait(80);
    assert.equal(p.credits, 9000);
    assert.equal(p.primary, null);
    for (const item of ["armor", "secondary"]) {
      assert.equal(g.buy(a.id, item), true);
      const balance = p.credits;
      b.ws.send(
        JSON.stringify({
          type: "refundEquipment",
          item,
          id: a.id,
          amount: 999999,
        }),
      );
      await wait(80);
      assert.equal(p.credits, balance);
      for (let i = 0; i < 2; i++)
        a.ws.send(
          JSON.stringify({ type: "refundEquipment", item, amount: 999999 }),
        );
      await wait(80);
      assert.equal(p.credits, 9000);
    }
  } finally {
    await app.close();
  }
});
async function connect(port, code, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw)));
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  ws.send(JSON.stringify({ type: "join", code, name }));
  for (let i = 0; i < 50 && !messages.some((m) => m.type === "welcome"); i++)
    await wait(10);
  return { ws, messages, id: messages.find((m) => m.type === "welcome")?.id };
}
test("real sockets share a room, isolate other rooms, reject non-owner start, clean on disconnect", async () => {
  const app = createServer({
    port: 0,
    host: "127.0.0.1",
    reconnectGraceMs: 30,
  });
  const { port } = await app.listen();
  try {
    const a = await connect(port, "ROOM1", "Alpha"),
      b = await connect(port, "ROOM1", "Bravo"),
      c = await connect(port, "ROOM2", "Charlie");
    assert.ok(a.id && b.id && c.id);
    b.ws.send(JSON.stringify({ type: "start" }));
    await wait(70);
    assert.equal(app.rooms.get("ROOM1").phase, "lobby");
    a.ws.send(JSON.stringify({ type: "start" }));
    await wait(100);
    const state = b.messages.filter((m) => m.type === "state").at(-1).state;
    assert.equal(state.phase, "buy");
    assert.equal(state.players.length, 2);
    assert.ok(!("hp" in state.players.find((p) => p.id === a.id)));
    assert.equal(state.players.find((p) => p.id === b.id).hp, 100);
    const alphaState = a.messages
      .filter((m) => m.type === "state")
      .at(-1).state;
    assert.ok(!("ammo" in alphaState.players.find((p) => p.id === b.id)));
    assert.equal(
      typeof alphaState.players.find((p) => p.id === a.id).ammo,
      "number",
    );
    assert.equal(
      c.messages.filter((m) => m.type === "state").at(-1).state.players.length,
      1,
    );
    a.ws.close();
    b.ws.close();
    c.ws.close();
    await wait(100);
    assert.equal(app.rooms.size, 0);
  } finally {
    await app.close();
  }
});
test("sponsor socket commands use sender identity and debit a teammate purchase exactly once", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    const a = await connect(port, "GIFT1", "A"),
      b = await connect(port, "GIFT1", "B"),
      c = await connect(port, "GIFT1", "C");
    a.ws.send(JSON.stringify({ type: "start" }));
    await wait(80);
    const g = app.rooms.get("GIFT1");
    g.players.get(a.id).credits = 9000;
    c.ws.send(
      JSON.stringify({ type: "requestWeapon", id: b.id, item: "rifle" }),
    );
    await wait(80);
    assert.equal(g.players.get(c.id).requestedWeapon, "rifle");
    assert.equal(g.players.get(b.id).requestedWeapon, null);
    b.ws.send(
      JSON.stringify({
        type: "sponsorWeapon",
        id: a.id,
        target: c.id,
        item: "rifle",
      }),
    );
    await wait(80);
    assert.equal(g.players.get(c.id).primary, null);
    const purchase = JSON.stringify({
      type: "sponsorWeapon",
      id: b.id,
      target: c.id,
      item: "rifle",
    });
    a.ws.send(purchase);
    a.ws.send(purchase);
    await wait(80);
    assert.equal(g.players.get(a.id).credits, 6100);
    assert.equal(g.players.get(c.id).primary, "rifle");
    assert.equal(g.players.get(b.id).credits, 800);
  } finally {
    await app.close();
  }
});

test("HTTP serves only public allowlist and malformed packets do not crash server", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/server.mjs`)).status,
      404,
    );
    const a = await connect(port, "SAFE1", "Test");
    a.ws.send("{bad");
    a.ws.send("null");
    a.ws.send(JSON.stringify({ type: "buy", item: { toString: null } }));
    a.ws.send(
      JSON.stringify({ type: "input", seq: 1, yaw: "invalid", pitch: 0 }),
    );
    await wait(80);
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
    a.ws.close();
  } finally {
    await app.close();
  }
});

test("team mark socket ignores forged player and coordinates", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    const a = await connect(port, "MARK1", "A"),
      b = await connect(port, "MARK1", "B");
    a.ws.send(JSON.stringify({ type: "start" }));
    await wait(80);
    const g = app.rooms.get("MARK1");
    Object.assign(g.players.get(a.id), { x: -18, z: 20, yaw: 0, pitch: -0.5 });
    a.ws.send(JSON.stringify({ type: "mark", id: b.id, x: 9999, z: 9999 }));
    await wait(100);
    assert.equal(g.pings.length, 1);
    assert.equal(g.pings[0].player, a.id);
    assert.equal(g.pings[0].x, -18);
    assert.ok(g.pings[0].z < 20);
    const state = b.messages.filter((m) => m.type === "state").at(-1).state;
    assert.equal(state.pings.length, 0);
  } finally {
    await app.close();
  }
});

test("real recipients receive hidden roster entries and regain coordinates only after line of sight opens", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    const a = await connect(port, "FOG1", "A"),
      b = await connect(port, "FOG1", "B");
    const g = app.rooms.get("FOG1");
    Object.assign(g.players.get(a.id), { x: -18, z: 10 });
    Object.assign(g.players.get(b.id), { x: -18, z: 0 });
    a.messages.length = 0;
    await wait(120);
    const hidden = a.messages
      .filter((m) => m.type === "state")
      .at(-1)
      .state.players.find((p) => p.id === b.id);
    assert.equal(hidden.visible, false);
    assert.ok(!("x" in hidden));
    Object.assign(g.players.get(b.id), { z: 7 });
    a.messages.length = 0;
    await wait(120);
    const visible = a.messages
      .filter((m) => m.type === "state")
      .at(-1)
      .state.players.find((p) => p.id === b.id);
    assert.equal(visible.visible, true);
    assert.equal(visible.z, 7);
    assert.ok(!("hp" in visible));
  } finally {
    await app.close();
  }
});
test("malformed join fields cannot crash the server through object conversion", async () => {
  const app = createServer({ port: 0, host: "127.0.0.1" });
  const { port } = await app.listen();
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`),
      messages = [];
    ws.on("message", (raw) => messages.push(JSON.parse(raw)));
    await new Promise((r, j) => {
      ws.once("open", r);
      ws.once("error", j);
    });
    ws.send(
      JSON.stringify({ type: "join", code: { toString: null }, name: "bad" }),
    );
    await wait(50);
    assert.equal(messages[0].type, "error");
    ws.send(
      JSON.stringify({ type: "join", code: "SAFE2", name: { toString: null } }),
    );
    await wait(50);
    assert.equal([...app.rooms.get("SAFE2").players.values()][0].name, "요원");
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
    ws.close();
  } finally {
    await app.close();
  }
});
