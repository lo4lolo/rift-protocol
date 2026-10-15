import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { WEAPONS } from "../shared.mjs";
import { damageAtDistance } from "../ballistics.mjs";
import { createWeapon, disposeModel } from "../public/art.mjs";
function setup() {
  const g = new Game("SHOTGUN", { random: () => 0.5 });
  const a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  a.credits = 4000;
  assert.equal(g.buy("a", "shotgun"), true);
  g.time = 1;
  g.phase = "live";
  g.end = 100;
  Object.assign(a, { x: -18, z: 0, yaw: 0, pitch: -0.06 });
  Object.assign(b, { x: -18, z: -4, armor: 0, hp: 500 });
  return { g, a, b, c };
}
test("one shell emits ten authoritative pellets and respects trigger/cooldown/empty magazine", () => {
  const { g, a, b } = setup();
  a.ammo = 1;
  a.input = { fire: true, firePressed: true };
  g.trigger(a);
  assert.equal(a.ammo, 0);
  assert.equal(g.events.filter((e) => e.type === "shot").length, 10);
  assert.equal(b.hp, 380);
  assert.equal(a.combatReport[0].hits, 10);
  g.time += 2;
  g.trigger(a);
  assert.equal(g.events.filter((e) => e.type === "shot").length, 10);
  a.ammo = 2;
  g.shoot(a);
  g.shoot(a);
  assert.equal(a.ammo, 1);
  let sample = 0;
  g.random = () => (++sample % 17) / 17;
  g.time += 1;
  g.shoot(a);
  const shots = g.events.filter((e) => e.type === "shot").slice(-10);
  assert.ok(new Set(shots.map((e) => e.to.join(","))).size > 5);
});
test("shotgun loses damage at distance, cannot penetrate solid cover and supports reload", () => {
  const { g, a, b } = setup();
  assert.equal(damageAtDistance(WEAPONS.shotgun, 4), 12);
  assert.ok(damageAtDistance(WEAPONS.shotgun, 20) < 4);
  Object.assign(a, { x: -18, z: 10 });
  Object.assign(b, { x: -18, z: 0 });
  g.shoot(a);
  assert.equal(b.hp, 500);
  a.ammo = 0;
  g.reload(a.id);
  for (let i = 0; i < 160; i++) g.tick(1 / 60);
  assert.equal(a.ammo, 6);
  assert.equal(a.reserve, 18);
});
test("shotgun purchase refund and teammate sponsorship share existing inventory rules", () => {
  const { g, a, c } = setup();
  g.phase = "buy";
  assert.equal(g.refundWeapon(a.id), true);
  assert.equal(a.credits, 4000);
  assert.equal(g.requestWeapon(c.id, "shotgun"), true);
  assert.equal(g.sponsorWeapon(a.id, c.id, "shotgun"), true);
  assert.equal(c.primary, "shotgun");
  assert.equal(c.ammo, 6);
  assert.equal(a.credits, 2900);
  const model = createWeapon("shotgun");
  assert.ok(model.userData.magazine);
  model.updateMatrixWorld(true);
  model.traverse((o) =>
    assert.ok(o.matrixWorld.elements.every(Number.isFinite)),
  );
  disposeModel(model);
});
