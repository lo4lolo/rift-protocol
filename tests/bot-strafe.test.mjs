import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { blocked } from "../shared.mjs";
function setup() {
  const g = new Game("STRAFE"),
    a = g.add("a", "A", "veil", true),
    b = g.add("b", "B");
  g.owner = a.id;
  g.start(a.id);
  g.phase = "live";
  g.end = 100;
  Object.assign(a, {
    x: -18,
    z: 0,
    yaw: 0,
    skill: 0,
    secondary: 0,
    ultimate: 0,
    reloadUntil: 2,
    botSkillAfter: 100,
  });
  Object.assign(b, { x: -18, z: -8 });
  return { g, a, b };
}
test("reloading bot strafes under actual ticks while keeping fire released", () => {
  const { g, a } = setup();
  const x = a.x;
  for (let i = 0; i < 20; i++) g.tick(1 / 60);
  assert.ok(Math.abs(a.x - x) > 0.5);
  assert.equal(a.input.fire, false);
  assert.equal(blocked(a.x, a.z), false);
});
test("wall blocks preferred strafe so bot picks the open direction", () => {
  const { g, a, b } = setup();
  a.x = -28.9;
  b.x = -28.9;
  g.time = 0.1;
  g.botThink(a);
  assert.equal(a.input.d, true);
  assert.equal(a.input.a, undefined);
});
test("firing window and queued burst do not add strafe movement", () => {
  const { g, a } = setup();
  a.reloadUntil = 0;
  g.time = 1;
  a.botTarget = "b";
  a.botSeen = 0;
  g.botThink(a);
  assert.equal(a.input.fire, true);
  assert.equal(a.input.a, undefined);
  assert.equal(a.input.d, undefined);
  a.reloadUntil = 2;
  a.queuedBurst = { remaining: 2 };
  g.botThink(a);
  assert.equal(a.input.a, undefined);
  assert.equal(a.input.d, undefined);
});
