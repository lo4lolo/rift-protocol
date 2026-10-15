import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { WEAPONS } from "../shared.mjs";
function setup() {
  const g = new Game("EQUIP", { random: () => 0.5 });
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start("a");
  a.credits = 9000;
  g.buy("a", "sniper");
  g.phase = "live";
  g.end = 100;
  return { g, a, b };
}
test("purchase and swaps enforce server equip time; duplicate selection cannot restart or shorten it", () => {
  const { g, a } = setup();
  assert.equal(a.equipUntil, WEAPONS.sniper.equip);
  g.shoot(a);
  assert.equal(a.ammo, 5);
  assert.equal(g.select(a.id, 1), false);
  assert.equal(a.equipUntil, 1);
  g.time = 0.1;
  g.select(a.id, 3);
  assert.equal(a.equipUntil, 1);
  g.select(a.id, 1);
  assert.equal(a.equipUntil, 1.1);
  g.time = 1.09;
  g.shoot(a);
  assert.equal(a.ammo, 5);
  g.time = 1.1;
  g.shoot(a);
  assert.equal(a.ammo, 4);
});
test("dropping active primary and picking it up both equip; reload starts after readiness", () => {
  const { g, a, b } = setup();
  g.time = 2;
  g.dropPrimary(a.id);
  assert.equal(a.equipUntil, 2 + WEAPONS.pistol.equip);
  Object.assign(b, { x: a.x, z: a.z });
  assert.equal(g.pickup(b.id), true);
  assert.equal(b.equipUntil, 3);
  b.ammo = 2;
  g.reload(b.id);
  assert.equal(b.reloadUntil, 3 + WEAPONS.sniper.reload);
  g.select(b.id, 2);
  assert.equal(b.reloadUntil, 0);
  assert.equal(
    g.snapshot(b.id).players.find((p) => p.id === b.id).equipUntil,
    b.equipUntil,
  );
  assert.ok(
    !("equipUntil" in g.snapshot(a.id).players.find((p) => p.id === b.id)),
  );
});
test("semi-auto press during equip is consumed; new round clears pending equip", () => {
  const { g, a } = setup();
  a.input = { fire: true };
  g.trigger(a);
  assert.equal(a.ammo, 5);
  g.time = 2;
  g.trigger(a);
  assert.equal(a.ammo, 5);
  a.input = {};
  g.trigger(a);
  a.input = { fire: true };
  g.trigger(a);
  assert.equal(a.ammo, 4);
  g.select(a.id, 2);
  assert.ok(a.equipUntil > g.time);
  g.nextRound();
  assert.equal(a.equipUntil, 0);
});
