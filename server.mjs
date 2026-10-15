import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Game } from "./game.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
export function createServer({
  port = Number(process.env.PORT) || 4175,
  host = process.env.HOST || "0.0.0.0",
  reconnectGraceMs = 30000,
} = {}) {
  const rooms = new Map();
  const sessions = new Map();
  let closing = false;
  function expireSessions() {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.socket || session.expiresAt > now) continue;
      sessions.delete(token);
      const game = rooms.get(session.code);
      game?.remove(session.id);
      if (game && ![...game.players.values()].some((p) => !p.bot))
        rooms.delete(session.code);
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://localhost");
      if (u.pathname === "/health") {
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({ ok: true, app: "rift-protocol", rooms: rooms.size }),
        );
      }
      const paths = {
        "/": "public/index.html",
        "/client.mjs": "public/client.mjs",
        "/art.mjs": "public/art.mjs",
        "/notifications.mjs": "public/notifications.mjs",
        "/style.css": "public/style.css",
        "/shared.mjs": "shared.mjs",
        "/netcode.mjs": "netcode.mjs",
        "/vendor/three.module.js": "node_modules/three/build/three.module.js",
        "/vendor/three.core.js": "node_modules/three/build/three.core.js",
      };
      const file = paths[u.pathname];
      if (!file) {
        res.writeHead(404);
        return res.end("Not found");
      }
      const body = await readFile(path.join(root, file));
      res.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html; charset=utf-8"
          : file.endsWith(".css")
            ? "text/css"
            : "text/javascript",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-cache");
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end("Unable to load game");
    }
  });
  const wss = new WebSocketServer({
    server,
    maxPayload: 4096,
    verifyClient: ({ origin, req }) =>
      !origin ||
      origin === `http://${req.headers.host}` ||
      origin === `https://${req.headers.host}`,
  });
  function send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 256000) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }
  wss.on("connection", (ws) => {
    ws.id = randomUUID();
    ws.room = null;
    ws.count = 0;
    ws.window = Date.now();
    ws.alive = true;
    ws.on("pong", () => (ws.alive = true));
    ws.on("error", () => {});
    ws.on("message", (raw) => {
      if (Date.now() - ws.window > 1000) {
        ws.window = Date.now();
        ws.count = 0;
      }
      if (++ws.count > 100) return ws.close(1008, "rate limit");
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (!m || typeof m !== "object") return;
      let game = rooms.get(ws.room);
      if (m.type === "join" && !game) {
        let code = typeof m.code === "string" ? m.code.toUpperCase() : "";
        if (!/^[A-Z0-9]{3,10}$/.test(code))
          return send(ws, {
            type: "error",
            message: "방 코드는 영문·숫자 3~10자로 입력하세요.",
          });
        expireSessions();
        if (typeof m.resumeToken === "string" && m.resumeToken) {
          const session = sessions.get(m.resumeToken);
          const previous = rooms.get(code)?.players.get(session?.id);
          if (!session || session.code !== code || !previous)
            return send(ws, {
              type: "error",
              reason: "resume_expired",
              message:
                "복귀 시간이 지났습니다. 다시 입장하면 새 자리로 연결됩니다.",
            });
          if (session.socket)
            return send(ws, {
              type: "error",
              reason: "resume_active",
              message:
                "기존 연결이 아직 활성 상태입니다. 잠시 후 다시 시도하세요.",
            });
          ws.id = session.id;
          ws.room = code;
          ws.resumeToken = m.resumeToken;
          ws.lastEvent = rooms.get(code).eventId;
          session.socket = ws;
          session.expiresAt = Infinity;
          previous.connected = true;
          previous.input = {};
          previous.commands = [];
          previous.ack = previous.seq;
          if (rooms.get(code).spike?.droppedBy === previous.id)
            rooms.get(code).spike.pickupAfter = rooms.get(code).time;
          if (!rooms.get(code).owner) rooms.get(code).owner = ws.id;
          send(ws, {
            type: "welcome",
            id: ws.id,
            code,
            resumeToken: ws.resumeToken,
            seq: previous.seq,
            resumed: true,
          });
          return;
        }
        game = rooms.get(code);
        if (!game) {
          if (rooms.size >= 32)
            return send(ws, {
              type: "error",
              message: "서버의 방이 가득 찼습니다.",
            });
          game = new Game(code);
          rooms.set(code, game);
        }
        // A friend can claim a training bot slot before the match starts.
        if (game.phase === "lobby" && game.players.size >= 10) {
          const bot = [...game.players.values()].reverse().find((p) => p.bot);
          if (bot) game.remove(bot.id);
        }
        const p = game.add(ws.id, m.name, m.agent);
        if (!p)
          return send(ws, {
            type: "error",
            message: "방이 가득 찼습니다. 최대 10명입니다.",
          });
        ws.room = code;
        ws.lastEvent = game.eventId;
        ws.resumeToken = randomUUID();
        sessions.set(ws.resumeToken, {
          id: ws.id,
          code,
          socket: ws,
          expiresAt: Infinity,
        });
        send(ws, {
          type: "welcome",
          id: ws.id,
          code,
          resumeToken: ws.resumeToken,
          seq: p.seq,
          resumed: false,
        });
        return;
      }
      if (!game) return;
      if (m.type === "chat") {
        const accepted = game.chat(ws.id, m.text);
        send(ws, {
          type: "chatAck",
          requestId: Number.isSafeInteger(m.requestId) ? m.requestId : null,
          accepted,
        });
      }
      if (m.type === "input") game.input(ws.id, m);
      if (m.type === "buy") game.buy(ws.id, m.item);
      if (m.type === "refundWeapon") game.refundWeapon(ws.id);
      if (m.type === "refundEquipment") game.refundEquipment(ws.id, m.item);
      if (m.type === "mark") game.mark(ws.id);
      if (m.type === "requestWeapon") game.requestWeapon(ws.id, m.item);
      if (m.type === "sponsorWeapon")
        game.sponsorWeapon(ws.id, m.target, m.item);
      if (m.type === "reload") game.reload(ws.id);
      if (m.type === "select") game.select(ws.id, m.slot);
      if (m.type === "drop") game.dropCore(ws.id);
      if (m.type === "dropWeapon") game.dropPrimary(ws.id);
      if (m.type === "pickup") game.pickup(ws.id);
      if (m.type === "ability") game.ability(ws.id, m.slot);
      if (m.type === "start") game.start(ws.id);
      if (m.type === "team") game.chooseTeam(ws.id, m.team);
      if (m.type === "configure") game.configure(ws.id, m.overtime);
      if (m.type === "lobby") game.returnToLobby(ws.id);
      if (m.type === "removeBots") game.removeBots(ws.id);
      if (m.type === "bots" && game.owner === ws.id && game.phase === "lobby") {
        while (game.players.size < 10) {
          const n = game.players.size;
          game.add(
            `bot-${randomUUID()}`,
            `훈련봇 ${n + 1}`,
            ["veil", "pulse", "dash", "haven"][n % 4],
            true,
          );
        }
      }
      if (m.type === "ping") send(ws, { type: "pong", stamp: m.stamp });
    });
    ws.on("close", () => {
      if (closing) return;
      const g = rooms.get(ws.room);
      const session = sessions.get(ws.resumeToken);
      if (!session || session.socket !== ws) return;
      session.socket = null;
      session.expiresAt = Date.now() + reconnectGraceMs;
      const p = g?.players.get(ws.id);
      if (p) {
        p.connected = false;
        p.input = {};
        p.commands = [];
        p.progress = 0;
        if (g.spike?.carrier === p.id) {
          g.spike.carrier = null;
          g.spike.x = p.x;
          g.spike.z = p.z;
          g.spike.pickupAfter = Infinity;
          g.spike.droppedBy = p.id;
        }
        if (g.owner === p.id)
          g.owner =
            [...g.players.values()].find((q) => !q.bot && q.connected)?.id ??
            null;
      }
      expireSessions();
    });
  });
  let snapshotElapsed = 0,
    lastTick = performance.now(),
    accumulator = 0;
  const timer = setInterval(() => {
    expireSessions();
    const now = performance.now();
    const elapsed = Math.min((now - lastTick) / 1000, 0.25);
    accumulator += elapsed;
    snapshotElapsed += elapsed;
    lastTick = now;
    while (accumulator >= 1 / 60) {
      for (const g of rooms.values()) g.tick(1 / 60);
      accumulator -= 1 / 60;
    }
    if (snapshotElapsed >= 0.05) {
      snapshotElapsed %= 0.05;
      for (const ws of wss.clients) {
        const g = rooms.get(ws.room);
        if (!g) continue;
        const viewer = g.players.get(ws.id);
        if (!viewer) continue;
        const state = g.snapshot(ws.id);
        if (
          send(ws, {
            type: "state",
            state: {
              ...state,
              events: state.events.filter((e) => e.id > (ws.lastEvent ?? 0)),
            },
          })
        )
          ws.lastEvent = g.eventId;
      }
    }
  }, 1000 / 60);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 15000);
  return {
    server,
    rooms,
    wss,
    listen: () =>
      new Promise((resolve) =>
        server.listen(port, host, () => resolve(server.address())),
      ),
    close: () =>
      new Promise((resolve) => {
        closing = true;
        clearInterval(timer);
        clearInterval(heartbeat);
        sessions.clear();
        rooms.clear();
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => server.close(resolve));
      }),
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createServer();
  app.listen().then((address) => {
    console.log(`RIFT PROTOCOL · http://localhost:${address.port}`);
    for (const list of Object.values(networkInterfaces()))
      for (const n of list || [])
        if (n.family === "IPv4" && !n.internal)
          console.log(`LAN · http://${n.address}:${address.port}`);
  });
}
