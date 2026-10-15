import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { botObjective } from "../tactics.mjs";
import { findEscapePath } from "../navigation.mjs";
import { MAP, CORE_BLAST, blocked } from "../shared.mjs";

function setup() {
  const g = new Game("ESCAPE");
  const a = g.add("a", "A", "veil", true);
  const b = g.add("b", "B", "pulse", true);
  g.owner = a.id;
  g.start(a.id);
  g.phase = "live";
  g.end = 6;
  Object.assign(g.spike, MAP.sites[0], { planted: true, carrier: null });
  for (const p of [a, b]) Object.assign(p, { x: -19, z: -14 });
  return { g, a, b };
}
test("escape routes from both sites remain walkable and finish beyond blast", () => {
  for (const site of MAP.sites) {
    const path = findEscapePath(site, site, CORE_BLAST.radius + 3);
    assert.ok(path.length > 0);
    for (const point of path)
      assert.equal(blocked(point.x, point.z, 0.7), false);
    assert.ok(Math.hypot(path.at(-1).x - site.x, path.at(-1).z - site.z) >= 19);
  }
});
test("defender preserves achievable defuse and checkpoint but escapes an impossible deadline", () => {
  const { g, a, b } = setup();
  assert.equal(botObjective(g, a).role, "escape");
  assert.equal(botObjective(g, b).role, "escape");
  g.spike.defuseCheckpoint = 3.5;
  assert.equal(botObjective(g, b).role, "defuse");
  g.spike.defuseCheckpoint = 0;
  b.progress = 4;
  assert.equal(botObjective(g, b).role, "defuse");
  b.progress = 0;
  g.end = 20;
  assert.equal(botObjective(g, a).role, "hold");
  assert.equal(botObjective(g, b).role, "defuse");
});
test("attacker retreats despite visible enemy and survives actual countdown", () => {
  const { g, a, b } = setup();
  b.bot = false;
  Object.assign(b, { x: -19, z: -20 });
  g.end = 7.9;
  a.yaw = 0;
  g.botThink(a);
  assert.equal(a.botRole, "escape");
  assert.equal(a.input.fire, undefined);
  assert.equal(a.input.w, true);
  for (let i = 0; i < 480; i++) g.tick(1 / 60);
  assert.equal(g.phase, "end");
  assert.equal(a.alive, true);
  assert.equal(a.hp, 100);
  assert.ok(Math.hypot(a.x - g.spike.x, a.z - g.spike.z) >= CORE_BLAST.radius);
});
