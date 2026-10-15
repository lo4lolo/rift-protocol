import { createServer } from "../server.mjs";
import { WebSocket } from "ws";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { reportDate } from "./report-time.mjs";
const app = createServer({
    port: 0,
    host: "127.0.0.1",
    reconnectGraceMs: 3000,
  }),
  { port } = await app.listen();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  for (let i = 0; i < 100 && !fn(); i++) await wait(10);
  assert.ok(fn(), "condition timed out");
}
async function connect(token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  let welcome, state;
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.type === "welcome") welcome = m;
    if (m.type === "state") state = m.state;
  });
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  ws.send(
    JSON.stringify({
      type: "join",
      code: "CYCLE",
      name: "Reconnect",
      resumeToken: token,
    }),
  );
  await until(() => welcome && state);
  return {
    ws,
    welcome,
    get state() {
      return state;
    },
  };
}
const clients = [];
let resumed = 0;
try {
  for (let i = 0; i < 10; i++) clients.push(await connect());
  const game = app.rooms.get("CYCLE");
  game.start(clients[0].welcome.id);
  for (let cycle = 0; cycle < 8; cycle++) {
    for (const c of clients) c.ws.terminate();
    await until(() => [...game.players.values()].every((p) => !p.connected));
    for (let i = 0; i < clients.length; i++) {
      const old = clients[i],
        next = await connect(old.welcome.resumeToken);
      assert.equal(next.welcome.id, old.welcome.id);
      assert.equal(next.welcome.resumed, true);
      const p = game.players.get(next.welcome.id);
      next.ws.send(
        JSON.stringify({
          type: "input",
          round: game.round,
          seq: next.welcome.seq + 1,
          yaw: p.yaw,
          pitch: 0,
        }),
      );
      await until(() => p.ack === next.welcome.seq + 1);
      clients[i] = next;
      resumed++;
    }
    assert.equal(game.players.size, 10);
    assert.equal(app.wss.clients.size, 10);
    assert.equal(new Set(clients.map((c) => c.welcome.id)).size, 10);
  }
  const report = {
    date: reportDate(),
    clients: 10,
    cycles: 8,
    resumed,
    players: game.players.size,
    openSockets: app.wss.clients.size,
    checks: [
      "identity preserved",
      "input ACK advances after resume",
      "no duplicate slots",
      "exactly ten live sockets after every cycle",
    ],
    note: "Local sockets only; no browser launched",
  };
  await writeFile(
    "evidence/reconnect-load.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await app.close();
}
