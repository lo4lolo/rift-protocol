import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";

// Test-only network harness. No latency or debug endpoint is installed on the game server.
export async function createLatencyProxy(
  targetPort,
  { delayMs = 100, jitterMs = 20 } = {},
) {
  const server = http.createServer((req, res) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
      },
      (reply) => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  const wss = new WebSocketServer({ server }),
    timers = new Set(),
    links = new Set();
  let packets = 0;
  wss.on("connection", (client) => {
    const upstream = new WebSocket(`ws://127.0.0.1:${targetPort}`, {
      origin: `http://127.0.0.1:${targetPort}`,
    });
    links.add(upstream);
    const beforeOpen = [];
    let upDue = 0,
      downDue = 0;
    function deliver(socket, data, direction) {
      const now = performance.now(),
        previous = direction === "up" ? upDue : downDue;
      const due = Math.max(
        previous,
        now + delayMs + ((packets++ % 5) * jitterMs) / 4,
      );
      if (direction === "up") upDue = due;
      else downDue = due;
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          if (socket.readyState === 1) socket.send(data.toString());
        },
        Math.max(0, due - now),
      );
      timers.add(timer);
    }
    upstream.on("open", () => {
      for (const data of beforeOpen) deliver(upstream, data, "up");
      beforeOpen.length = 0;
    });
    client.on("message", (data) =>
      upstream.readyState === 0
        ? beforeOpen.push(data)
        : deliver(upstream, data, "up"),
    );
    upstream.on("message", (data) => deliver(client, data, "down"));
    client.on("close", () => upstream.close());
    upstream.on("close", () => {
      links.delete(upstream);
      client.close();
    });
    client.on("error", () => {});
    upstream.on("error", () => client.close());
  });
  const address = await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address())),
  );
  return {
    port: address.port,
    close: () =>
      new Promise((resolve) => {
        for (const t of timers) clearTimeout(t);
        for (const c of wss.clients) c.terminate();
        for (const c of links) c.terminate();
        wss.close(() => server.close(resolve));
      }),
  };
}
