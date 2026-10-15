import test from "node:test";
import assert from "node:assert/strict";
import { damageAtDistance, traceBullet, rayInterval } from "../ballistics.mjs";
import { WEAPONS } from "../shared.mjs";
import { Game } from "../game.mjs";
test("range bands preserve close damage and reduce distant pistol/SMG and leg hits", () => {
  assert.equal(damageAtDistance(WEAPONS.pistol, 30, "head"), 78);
  assert.equal(damageAtDistance(WEAPONS.pistol, 31, "head"), 78 * 0.85);
  assert.equal(damageAtDistance(WEAPONS.smg, 40, "body"), 26 * 0.7);
  assert.equal(damageAtDistance(WEAPONS.rifle, 80, "head"), 150);
  assert.equal(damageAtDistance(WEAPONS.sniper, 10, "legs"), 120);
});
test("ray intervals handle inside, parallel and behind origins", () => {
  assert.deepEqual(rayInterval([0, 1, 0], [0, 0, -1], [-1, 0, -2], [1, 2, 2]), {
    near: 0,
    far: 2,
  });
  assert.equal(
    rayInterval([3, 1, 0], [0, 0, -1], [-1, 0, -2], [1, 2, 2]),
    null,
  );
  assert.equal(rayInterval([0, 1, 0], [0, 0, -1], [-1, 0, 2], [1, 2, 3]), null);
});
test("penetration pays total thickness, respects masonry and does not count walls behind target", () => {
  const origin = [0, 1, 0],
    dir = [0, 0, -1],
    wood = [0, -3, 3, 1, 2, "wood"];
  assert.equal(
    traceBullet(origin, dir, 10, WEAPONS.pistol, [wood]).multiplier,
    0,
  );
  const hit = traceBullet(origin, dir, 10, WEAPONS.rifle, [wood]);
  assert.equal(hit.penetrated, 1);
  assert.ok(hit.multiplier > 0 && hit.multiplier < 1);
  assert.equal(
    traceBullet(origin, dir, 10, WEAPONS.rifle, [
      wood,
      [0, -5, 3, 2, 2, "wood"],
    ]).multiplier,
    0,
  );
  assert.equal(
    traceBullet(origin, dir, 10, WEAPONS.sniper, [[0, -3, 3, 0.2, 5, "stone"]])
      .multiplier,
    0,
  );
  assert.equal(
    traceBullet(origin, dir, 1, WEAPONS.rifle, [wood]).multiplier,
    1,
  );
  assert.equal(
    traceBullet(origin, dir, 10, WEAPONS.knife, [wood]).multiplier,
    0,
  );
});
test("server hits through an existing low crate with sniper but not pistol; tall wall still blocks", () => {
  const g = new Game("BALL", { random: () => 0.5 });
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start("a");
  g.phase = "live";
  Object.assign(a, { x: -22, z: 19, yaw: 0, pitch: Math.atan2(1 - 1.6, 8) });
  Object.assign(b, { x: -22, z: 11 });
  g.shoot(a);
  assert.equal(b.hp, 100);
  a.weapon = "sniper";
  a.ammo = 5;
  g.time += 2;
  g.shoot(a);
  assert.ok(b.hp < 100 && b.hp > 0);
  assert.equal(g.events.at(-1).penetrated, 1);
  Object.assign(a, { x: 0, z: 0 });
  Object.assign(b, { x: 0, z: -10, hp: 100 });
  g.time += 2;
  g.shoot(a);
  assert.equal(b.hp, 100);
});
test("server propagates legs region and scaled damage from real aim ray", () => {
  const g = new Game("BALL", { random: () => 0.5 });
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start("a");
  g.phase = "live";
  Object.assign(a, { x: -18, z: 0, yaw: 0, pitch: Math.atan2(0.4 - 1.6, 5) });
  Object.assign(b, { x: -18, z: -5 });
  g.shoot(a);
  assert.equal(g.events.at(-1).region, "legs");
  assert.ok(Math.abs(b.hp - (100 - 26 * 0.85)) < 1e-8);
});
