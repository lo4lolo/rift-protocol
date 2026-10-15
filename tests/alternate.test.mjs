import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { shotProfile } from "../shared.mjs";
function setup() {
  const g = new Game("ALT", { random: () => 0.5 });
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start("a");
  g.phase = "live";
  g.end = 100;
  Object.assign(a, { x: -18, z: 0, yaw: 0, pitch: -0.06 });
  Object.assign(b, { x: -18, z: -4, armor: 0 });
  return { g, a, b };
}
test("alternate pistol fires three independent rays, consumes three rounds, and shares cooldown with primary", () => {
  const { g, a, b } = setup();
  g.shoot(a, true);
  assert.equal(a.ammo, 9);
  assert.equal(b.hp, 22);
  assert.equal(a.combatReport[0].weapon, "pistol");
  assert.equal(a.combatReport[0].region, "body");
  assert.equal(a.combatReport[0].hits, 3);
  assert.equal(a.combatReport[0].health, 78);
  assert.deepEqual(
    g.events.filter((e) => e.type === "shot").map((e) => e.pellet),
    [0, 1, 2],
  );
  g.time = 0.3;
  g.shoot(a);
  assert.equal(a.ammo, 9);
  g.time = 0.56;
  g.shoot(a);
  assert.equal(a.ammo, 8);
  assert.equal(a.kills, 1);
});
test("low ammunition emits only available pellets; unsupported weapons cannot request alternate fire", () => {
  const { g, a, b } = setup();
  a.ammo = 1;
  g.shoot(a, true);
  assert.equal(a.ammo, 0);
  assert.equal(b.hp, 74);
  assert.equal(g.events.filter((e) => e.type === "shot").length, 1);
  a.weapon = "rifle";
  a.ammo = 25;
  g.time = 2;
  g.shoot(a, true);
  assert.equal(a.ammo, 25);
  a.input = { ads: true };
  const aimed = shotProfile("pistol", a, 2).spread;
  a.input = {};
  assert.equal(shotProfile("pistol", a, 2).spread, aimed);
});
test("held alternate trigger does not repeat and simultaneous buttons cannot double-fire", () => {
  const { g, a } = setup();
  a.input = { fire: true, firePressed: true, altFire: true, altPressed: true };
  g.trigger(a);
  assert.equal(a.ammo, 9);
  g.time = 1;
  g.trigger(a);
  assert.equal(a.ammo, 9);
  a.input = {};
  g.trigger(a);
  a.input = { altPressed: true };
  g.trigger(a);
  assert.equal(a.ammo, 6);
  g.time = 2;
  g.trigger(a);
  assert.equal(a.ammo, 6);
});
