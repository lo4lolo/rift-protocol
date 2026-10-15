import test from "node:test";
import assert from "node:assert/strict";
import { shotProfile, WEAPONS } from "../shared.mjs";
import { Game } from "../game.mjs";
test("accuracy distinguishes standing, walking, running, jumping, crouching and aiming", () => {
  const p = { input: {}, y: 0, burst: 0, lastShot: -10 };
  const base = shotProfile("rifle", p, 0).spread;
  p.input = { w: true, walk: true };
  const walk = shotProfile("rifle", p, 0).spread;
  p.input = { w: true };
  const run = shotProfile("rifle", p, 0).spread;
  p.y = 1;
  const air = shotProfile("rifle", p, 0).spread;
  assert.ok(base < walk && walk < run && run < air);
  p.y = 0;
  p.input = { crouch: true, ads: true };
  assert.ok(shotProfile("rifle", p, 0).spread < base);
  p.input = { w: true, s: true };
  assert.equal(shotProfile("rifle", p, 0).spread, base);
});
test("recoil recovers continuously to first-shot accuracy and never transfers to a different weapon", () => {
  const p = { input: {}, y: 0, burst: 10, recoilWeapon: "rifle", lastShot: 0 };
  const now = shotProfile("rifle", p, 0.1),
    middle = shotProfile("rifle", p, 0.4),
    rest = shotProfile("rifle", p, 1);
  assert.ok(now.pitch > middle.pitch && middle.pitch > rest.pitch);
  assert.ok(now.spread > middle.spread && middle.spread > rest.spread);
  assert.equal(rest.pitch, 0);
  assert.equal(rest.spread, WEAPONS.rifle.spread);
  assert.equal(shotProfile("pistol", p, 0.1).heat, 0);
});
test("authoritative repeated shots climb, pause resets climb, and snapshots preserve own recovery state", () => {
  const g = new Game("RECOIL", { random: () => 0.5 });
  const p = g.add("a", "A");
  g.add("b", "B");
  g.start("a");
  g.phase = "live";
  p.weapon = "rifle";
  p.ammo = 25;
  Object.assign(p, { x: -18, z: 10, yaw: 0, pitch: 0 });
  const slope = () => {
    const e = g.events.at(-1);
    return (
      (e.to[1] - e.from[1]) /
      Math.hypot(e.to[0] - e.from[0], e.to[2] - e.from[2])
    );
  };
  g.shoot(p);
  const first = slope();
  g.time += 0.11;
  g.shoot(p);
  const second = slope();
  g.time += 0.11;
  g.shoot(p);
  const third = slope();
  assert.ok(first < second && second < third);
  const self = g.snapshot("a").players.find((q) => q.id === "a");
  assert.equal(shotProfile("rifle", self, g.time).heat, p.burst);
  assert.ok(!("burst" in g.snapshot("b").players.find((q) => q.id === "a")));
  g.time += 1;
  g.shoot(p);
  assert.equal(slope(), first);
});
