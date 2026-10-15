import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("HEAL");
  const a = g.add("a", "A", "haven"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  g.phase = "live";
  g.end = 100;
  Object.assign(a, { x: -18, z: 0, yaw: 0 });
  Object.assign(b, { x: -18, z: -4, hp: 20 });
  Object.assign(c, { x: -18, z: -3, hp: 20 });
  return { g, a, b, c };
}
test("healing selects aimed ally, caps health, excludes enemies and spends once", () => {
  const { g, a, b, c } = setup();
  assert.equal(g.ability(a.id), true);
  assert.equal(c.hp, 80);
  assert.equal(b.hp, 20);
  assert.equal(a.skill, 0);
  assert.equal(g.ability(a.id), false);
  a.skill = 1;
  c.hp = 90;
  g.ability(a.id);
  assert.equal(c.hp, 100);
  a.skill = 1;
  assert.equal(g.ability(a.id), false);
  assert.equal(a.skill, 1);
  a.hp = 50;
  g.ability(a.id);
  assert.equal(a.hp, 100);
});
test("healing cannot cross walls or restore dead disconnected distant allies", () => {
  const { g, a, c } = setup();
  g.smokes = [{ x: -18, z: -1.5 }];
  assert.equal(g.ability(a.id), false);
  g.smokes = [];
  for (const change of [
    { z: 5 },
    { z: -3, alive: false },
    { alive: true, connected: false },
    { connected: true, z: -25 },
  ]) {
    Object.assign(c, change);
    assert.equal(g.ability(a.id), false);
  }
  Object.assign(a, { z: 10 });
  Object.assign(c, { z: 0 });
  assert.equal(g.ability(a.id), false);
  assert.equal(a.skill, 1);
  g.phase = "buy";
  assert.equal(g.ability(a.id), false);
});
test("shield and healing wave preserve resource caps and never resurrect or heal enemies", () => {
  const { g, a, b, c } = setup();
  a.secondary = 2;
  a.armor = 40;
  assert.equal(g.ability(a.id, "secondary"), true);
  assert.equal(a.armor, 50);
  assert.equal(g.ability(a.id, "secondary"), false);
  assert.equal(a.secondary, 1);
  a.ultimate = 7;
  a.hp = 10;
  assert.equal(g.ability(a.id, "ultimate"), true);
  assert.equal(a.hp, 100);
  assert.equal(c.hp, 100);
  assert.equal(b.hp, 20);
  assert.equal(a.ultimate, 0);
  a.ultimate = 7;
  c.alive = false;
  c.hp = 0;
  assert.equal(g.ability(a.id, "ultimate"), false);
  assert.equal(a.ultimate, 7);
});

test("healing ray follows vertical aim and crouched silhouette instead of a horizontal cone", () => {
  const { g, a, b, c } = setup();
  b.x = -25;
  c.x = -17;
  assert.equal(g.ability(a.id), false);
  c.x = -18;
  c.y = 3;
  assert.equal(g.ability(a.id), false);
  a.pitch = Math.atan2(3, 3);
  assert.equal(g.ability(a.id), true);
  assert.equal(c.hp, 80);
  a.skill = 1;
  a.pitch = 0;
  c.y = 0;
  c.input.crouch = true;
  c.hp = 20;
  assert.equal(g.ability(a.id), false);
  a.pitch = Math.atan2(1.1 - 1.6, 3);
  assert.equal(g.ability(a.id), true);
});

test("nearest body blocks healing through enemies or full-health allies", () => {
  const { g, a, b, c } = setup();
  b.z = -2;
  assert.equal(g.ability(a.id), false);
  assert.equal(c.hp, 20);
  b.team = a.team;
  b.hp = 100;
  assert.equal(g.ability(a.id), false);
  assert.equal(a.skill, 1);
  b.alive = false;
  assert.equal(g.ability(a.id), true);
  assert.equal(c.hp, 80);
});
