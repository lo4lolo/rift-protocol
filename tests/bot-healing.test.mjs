import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("BOTHEAL");
  const a = g.add("a", "A", "haven", true),
    b = g.add("b", "B"),
    c = g.add("c", "C"),
    d = g.add("d", "D"),
    e = g.add("e", "E");
  g.owner = a.id;
  g.start(a.id);
  g.phase = "live";
  g.end = 100;
  Object.assign(a, { x: -18, z: 0, yaw: Math.PI });
  Object.assign(c, { x: -18, z: -3, hp: 30 });
  Object.assign(e, { x: -19, z: -5, hp: 100 });
  for (const p of [b, d]) Object.assign(p, { x: 20, z: 20 });
  return { g, a, b, c, e };
}
test("support bot aims at wounded teammate and resumes mission after healing", () => {
  const { g, a, c } = setup();
  g.botThink(a);
  assert.equal(c.hp, 90);
  assert.equal(a.skill, 0);
  assert.equal(a.botRole, "heal");
  assert.ok(a.pitch < 0);
  g.time = 2;
  g.botThink(a);
  assert.notEqual(a.botRole, "heal");
});
test("support bot uses wave for multiple critical allies but preserves it for one", () => {
  const { g, a, c, e } = setup();
  a.ultimate = 7;
  g.botThink(a);
  assert.equal(a.ultimate, 7);
  assert.equal(c.hp, 90);
  g.time = 2;
  c.hp = 30;
  e.hp = 20;
  g.botThink(a);
  assert.equal(a.ultimate, 0);
  assert.equal(c.hp, 100);
  assert.equal(e.hp, 100);
});
test("support bot respects cover, smoke, enemy combat and urgent defuse", () => {
  const { g, a, b, c, e } = setup();
  g.smokes = [{ x: -18, z: -1.5, end: 100 }];
  g.botThink(a);
  assert.equal(c.hp, 30);
  g.smokes = [];
  Object.assign(a, { z: 10 });
  g.botThink(a);
  assert.equal(c.hp, 30);
  a.z = 0;
  a.yaw = 0;
  Object.assign(b, { x: -18, z: -2 });
  g.botThink(a);
  assert.equal(c.hp, 30);
  b.x = 20;
  a.team = 1;
  c.team = 1;
  e.team = 1;
  Object.assign(g.spike, { planted: true, x: -18, z: 0, carrier: null });
  g.botThink(a);
  assert.equal(c.hp, 30);
  assert.equal(a.botRole, "defuse");
});
