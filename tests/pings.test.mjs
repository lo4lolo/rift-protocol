import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("PING"),
    a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  g.end = 100;
  Object.assign(a, { x: -18, z: 10, yaw: 0, pitch: 0 });
  return { g, a, b, c };
}
test("aim marks stop before walls and downward aim reaches ground; empty sky is not marked", () => {
  const { g, a } = setup();
  assert.equal(g.mark("a"), true);
  assert.ok(g.pings[0].z > 4.5 && g.pings[0].z < 4.7);
  g.time = 2;
  a.pitch = -Math.PI / 4;
  assert.equal(g.mark("a"), true);
  assert.ok(g.pings[0].y < 0.1);
  g.time = 4;
  a.pitch = 1.45;
  assert.equal(g.mark("a"), false);
});
test("marks are team-private, rate limited, one per sender, expire and reset with rounds", () => {
  const { g } = setup();
  g.mark("a");
  assert.equal(g.mark("a"), false);
  assert.equal(g.snapshot("c").pings.length, 1);
  assert.equal(g.snapshot("b").pings.length, 0);
  assert.equal(g.snapshot("missing").pings.length, 0);
  g.time = 1.1;
  g.mark("a");
  assert.equal(g.pings.length, 1);
  g.tick(5);
  assert.equal(g.pings.length, 0);
  g.mark("a");
  g.nextRound();
  assert.equal(g.pings.length, 0);
});
test("dead, disconnected and lobby players cannot mark", () => {
  const { g, a } = setup();
  a.alive = false;
  assert.equal(g.mark("a"), false);
  a.alive = true;
  a.connected = false;
  assert.equal(g.mark("a"), false);
  a.connected = true;
  g.phase = "lobby";
  assert.equal(g.mark("a"), false);
  assert.equal(g.mark("missing"), false);
});
