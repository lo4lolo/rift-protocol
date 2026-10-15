import { reportDate } from "./report-time.mjs";
import { WebSocket } from "ws";
import { createServer } from "../server.mjs";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = createServer({ port: 0, host: "127.0.0.1" }),
  { port } = await app.listen();
const clients = [];
let timer;
try {
  for (let i = 0; i < 10; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`),
      c = { ws, id: null, seq: 0, snapshots: 0, bytes: 0, last: null };
    clients.push(c);
    ws.on("message", (raw) => {
      c.bytes += raw.length;
      const m = JSON.parse(raw);
      if (m.type === "welcome") c.id = m.id;
      if (m.type === "state") {
        c.snapshots++;
        c.last = m.state;
      }
    });
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    ws.send(
      JSON.stringify({ type: "join", code: "LOAD10", name: `Client${i}` }),
    );
  }
  for (let i = 0; i < 100 && !clients.every((c) => c.id); i++) await sleep(10);
  assert.ok(clients.every((c) => c.id));
  const g = app.rooms.get("LOAD10");
  g.cfg.buy = 0.05;
  clients[0].ws.send(JSON.stringify({ type: "start" }));
  const started = performance.now();
  timer = setInterval(() => {
    for (const c of clients)
      c.ws.send(
        JSON.stringify({
          type: "input",
          seq: ++c.seq,
          round: c.last?.round ?? 0,
          yaw: 0,
          pitch: 0,
          w: true,
          fire: true,
          hp: 999,
          x: 999,
        }),
      );
  }, 1000 / 30);
  await sleep(5000);
  clearInterval(timer);
  const elapsed = (performance.now() - started) / 1000;
  for (const c of clients) {
    assert.equal(c.ws.readyState, 1);
    assert.equal(c.last.players.length, 10);
    assert.ok(c.snapshots >= 50);
    assert.ok(
      c.last.players.every(
        (p) =>
          (p.hp === undefined || p.hp <= 100) &&
          (p.visible === false
            ? !("x" in p) && !("z" in p)
            : Math.abs(p.x) < 30) &&
          !("path" in p),
      ),
    );
  }
  const result = {
    date: reportDate(),
    clients: 10,
    seconds: Number(elapsed.toFixed(2)),
    inputHz: 30,
    minimumSnapshots: Math.min(...clients.map((c) => c.snapshots)),
    averageDownstreamKBps: Number(
      (clients.reduce((a, c) => a + c.bytes, 0) / 10 / elapsed / 1024).toFixed(
        1,
      ),
    ),
    serverSimulationSeconds: Number(g.time.toFixed(2)),
    checks: [
      "10 real WebSocket clients remain connected",
      "all clients receive 10-player state",
      "forged health and position ignored",
      "private bot navigation omitted",
    ],
  };
  await writeFile(
    "evidence/network-load.json",
    JSON.stringify(result, null, 2),
  );
  console.log(result);
} finally {
  clearInterval(timer);
  for (const c of clients) c.ws.close();
  await app.close();
}
