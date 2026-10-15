import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("LOOT", { random: () => 0.5 });
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start("a");
  a.credits = 9000;
  g.buy("a", "rifle");
  a.x = -18;
  a.z = 0;
  b.x = -18;
  b.z = -1;
  g.phase = "live";
  g.end = 100;
  return { g, a, b };
}
test("dropped primary preserves ammo, can be picked once, and clears on new round", () => {
  const { g, a, b } = setup();
  a.ammo = 7;
  a.reserve = 31;
  assert.equal(g.dropPrimary("a"), true);
  assert.equal(a.primary, null);
  assert.equal(g.drops.length, 1);
  assert.equal(g.pickup("b"), true);
  assert.equal(b.weapon, "rifle");
  assert.equal(b.ammo, 7);
  assert.equal(b.reserve, 31);
  assert.equal(g.pickup("a"), false);
  g.dropPrimary("b");
  g.nextRound();
  assert.equal(g.drops.length, 0);
});
test("death drops the owned primary even when a pistol is equipped", () => {
  const { g, a, b } = setup();
  a.ammo = 6;
  g.select("a", 2);
  b.yaw = Math.PI;
  b.pitch = 0;
  a.hp = 20;
  g.shoot(b);
  assert.equal(a.alive, false);
  assert.equal(g.drops[0].weapon, "rifle");
  assert.equal(g.drops[0].ammo, 6);
});
test("pickup cannot reach a distant item and swapping leaves the old primary", () => {
  const { g, a, b } = setup();
  g.dropPrimary("a");
  b.x = 20;
  assert.equal(g.pickup("b"), false);
  b.x = -18;
  b.primary = b.weapon = "smg";
  b.ammo = 13;
  b.reserve = 30;
  assert.equal(g.pickup("b"), true);
  assert.equal(b.weapon, "rifle");
  assert.equal(g.drops[0].weapon, "smg");
  assert.equal(g.drops[0].ammo, 13);
});
