import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { move } from "../shared.mjs";
import { motionState, simulateCommand, reconcile } from "../netcode.mjs";
function setup() {
  const g = new Game("TAG"),
    a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  g.phase = "live";
  g.end = 100;
  return { g, a, b, c };
}
test("enemy damage refreshes a bounded slow; friendly, zero and invalid damage cannot apply it", () => {
  const { g, a, b, c } = setup();
  g.damage(a, 10, c);
  assert.equal(a.slow, 0);
  for (const damage of [0, -5, NaN, Infinity]) g.damage(a, damage, b);
  assert.equal(a.slow, 0);
  assert.equal(a.hp, 100);
  g.damage(a, 10, b);
  assert.equal(a.slow, 0.35);
  for (let i = 0; i < 12; i++) g.tick(1 / 60);
  assert.ok(a.slow > 0 && a.slow < 0.16);
  g.damage(a, 10, b);
  assert.equal(a.slow, 0.35);
  for (let i = 0; i < 30; i++) g.tick(1 / 60);
  assert.equal(a.slow, 0);
  g.damage(a, 10, b);
  g.nextRound();
  assert.equal(a.slow, 0);
});
test("run, walk and crouch apply the same speed fraction and prediction keeps server slow state", () => {
  for (const input of [
    { w: true },
    { w: true, walk: true },
    { w: true, crouch: true },
  ]) {
    const base = { x: -18, z: 10, yaw: 0, y: 0, vy: 0, pitch: 0 },
      slow = { ...base, slow: 0.35 };
    move(base, input, 0.1);
    move(slow, input, 0.1);
    assert.ok(Math.abs((10 - slow.z) * 2 - (10 - base.z)) < 1e-8);
  }
  const state = {
    x: -18,
    z: 10,
    yaw: 0,
    y: 0,
    vy: 0,
    pitch: 0,
    slow: 0.3,
    alive: true,
    ack: 1,
  };
  const command = { seq: 2, w: true, yaw: 0, pitch: 0 };
  const predicted = motionState(state);
  simulateCommand(predicted, command);
  const replay = reconcile(state, [command]).predicted;
  assert.equal(predicted.z, replay.z);
  assert.equal(replay.slow, 0.3);
});
test("slow expires without any commands and is sent only to the affected team", () => {
  const { g, a, b } = setup();
  g.damage(a, 1, b);
  assert.equal(g.snapshot("a").players.find((p) => p.id === "a").slow, 0.35);
  assert.ok(!("slow" in g.snapshot("b").players.find((p) => p.id === "a")));
  g.tick(0.4);
  assert.equal(a.slow, 0);
});
