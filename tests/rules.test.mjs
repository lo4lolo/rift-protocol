import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { blocked, move, rayBox } from "../shared.mjs";
function setup(options = {}) {
  const g = new Game("TEST", options);
  g.add("a", "Alpha");
  g.add("b", "Bravo");
  g.start("a");
  return g;
}
function advance(g, s) {
  for (let i = 0; i < Math.ceil(s * 60); i++) g.tick(1 / 60);
}
test("balanced 5v5, capacity and owner-only match start", () => {
  const g = new Game("TEST");
  for (let i = 0; i < 10; i++) g.add(String(i), "P");
  assert.equal(g.add("overflow", "X"), null);
  assert.equal([...g.players.values()].filter((p) => p.team === 0).length, 5);
  assert.equal(g.start("1"), false);
  assert.equal(g.start("0"), true);
  assert.equal(g.phase, "buy");
});
test("purchases reject insufficient funds, duplicate shield and live requests", () => {
  const g = setup(),
    p = g.players.get("a");
  assert.equal(g.buy("a", "rifle"), false);
  p.credits = 5000;
  assert.equal(g.buy("a", "rifle"), true);
  assert.equal(p.credits, 2100);
  assert.equal(g.buy("a", "armor"), true);
  assert.equal(g.buy("a", "armor"), false);
  g.phase = "live";
  assert.equal(g.buy("a", "smg"), false);
});
test("movement is normalized and walls cannot be crossed", () => {
  let p = { x: 0, z: 0, yaw: 0 };
  move(p, { w: true, d: true }, 0.1);
  assert.ok(Math.abs(Math.hypot(p.x, p.z) - 0.56) < 1e-6);
  p = { x: 0, z: -2.8, yaw: 0 };
  for (let i = 0; i < 60; i++) move(p, { w: true }, 1 / 60);
  assert.equal(blocked(p.x, p.z), false);
  assert.ok(p.z > -3.2);
});
test("malformed and replayed input cannot modify position or orientation", () => {
  const g = setup();
  g.input("a", { seq: 1, yaw: NaN, pitch: 0 });
  assert.equal(g.players.get("a").seq, 0);
  g.input("a", { seq: 2, round: g.round, yaw: 1, pitch: 99, w: true, x: 999 });
  g.input("a", { seq: 1, yaw: 2, pitch: 0 });
  g.tick(1 / 30);
  assert.equal(g.players.get("a").yaw, 1);
  assert.equal(g.players.get("a").pitch, 1.45);
  assert.notEqual(g.players.get("a").x, 999);
});
test("server controls hits, ammo and fire rate; wall blocks damage", () => {
  const g = setup(),
    a = g.players.get("a"),
    b = g.players.get("b");
  g.phase = "live";
  g.end = 100;
  a.x = -19;
  a.z = 0;
  a.yaw = 0;
  b.x = -19;
  b.z = -5;
  g.shoot(a);
  assert.ok(b.hp < 100);
  assert.equal(a.ammo, 11);
  g.shoot(a);
  assert.equal(a.ammo, 11);
  g.time += 1;
  b.hp = 100;
  b.z = -17;
  b.x = -22;
  a.x = -22;
  g.shoot(a);
  assert.equal(b.hp, 100);
});
test("friendly fire is off and dead shooters cannot fire", () => {
  const g = setup();
  const a = g.players.get("a"),
    b = g.players.get("b");
  g.phase = "live";
  a.x = -18;
  a.z = 0;
  b.x = -18;
  b.z = -5;
  b.team = 0;
  g.shoot(a);
  assert.equal(b.hp, 100);
  a.alive = false;
  g.time++;
  const n = a.ammo;
  g.shoot(a);
  assert.equal(a.ammo, n);
});
test("reload consumes reserves after server timer", () => {
  const g = setup(),
    a = g.players.get("a");
  a.ammo = 2;
  a.reserve = 5;
  g.reload("a");
  assert.equal(a.ammo, 2);
  advance(g, 1.6);
  assert.equal(a.ammo, 7);
  assert.equal(a.reserve, 0);
});
test("plant requires site and held input; defuse wins even after attacker death", () => {
  const g = setup({ plant: 0.1, defuse: 0.1 }),
    a = g.players.get("a"),
    b = g.players.get("b");
  g.phase = "live";
  g.end = 100;
  a.input = { use: true };
  a.lastInput = 100;
  advance(g, 0.15);
  assert.equal(g.spike.planted, false);
  a.x = -19;
  a.z = -16;
  advance(g, 0.15);
  assert.equal(g.spike.planted, true);
  a.alive = false;
  b.x = -18;
  b.z = -16;
  b.input = { use: true };
  b.lastInput = 100;
  advance(g, 0.15);
  assert.equal(g.phase, "end");
  assert.equal(g.winner, 1);
});
test("planted core detonates even with no living attackers", () => {
  const g = setup({ fuse: 0.1 }),
    a = g.players.get("a");
  g.phase = "live";
  g.spike.planted = true;
  a.alive = false;
  g.end = 0.1;
  advance(g, 0.2);
  assert.equal(g.winner, 0);
});
test("round timeout rewards defense and dead equipment resets", () => {
  const g = setup(),
    a = g.players.get("a");
  g.phase = "live";
  g.end = 0.1;
  a.weapon = "rifle";
  a.alive = false;
  advance(g, 0.2);
  assert.equal(g.winner, 1);
  assert.equal(a.weapon, "pistol");
  assert.equal(a.credits, 2700);
});
test("skills limited to one per round; smoke expires", () => {
  const g = setup();
  assert.equal(g.ability("a"), false);
  g.phase = "live";
  g.end = 100;
  assert.equal(g.ability("a"), true);
  assert.equal(g.ability("a"), false);
  assert.equal(g.smokes.length, 1);
  advance(g, 12.1);
  assert.equal(g.smokes.length, 0);
});
test("side switch at round 13 and first-to-13 ends match", () => {
  const g = setup();
  g.round = 12;
  g.score = [8, 4];
  g.nextRound();
  assert.equal(g.players.get("a").team, 1);
  assert.deepEqual(g.score, [4, 8]);
  g.phase = "live";
  g.score = [12, 0];
  g.finish(0, "test");
  advance(g, 6.1);
  assert.equal(g.phase, "match");
});
test("ray slab calculation handles parallel and inside rays", () => {
  assert.equal(rayBox([0, 1, 0], [0, 0, -1], [-1, 0, -5], [1, 2, -3]), 3);
  assert.equal(
    rayBox([2, 1, 0], [0, 0, -1], [-1, 0, -5], [1, 2, -3]),
    Infinity,
  );
});
test("weapon slots preserve ammo, reject unowned primary and cancel reload", () => {
  const g = setup(),
    p = g.players.get("a");
  assert.equal(g.select("a", 1), false);
  p.credits = 5000;
  g.buy("a", "rifle");
  p.ammo = 9;
  g.reload("a");
  assert.ok(p.reloadUntil);
  assert.equal(g.select("a", 2), true);
  assert.equal(p.reloadUntil, 0);
  assert.equal(p.ammo, 12);
  g.select("a", 1);
  assert.equal(p.ammo, 9);
  g.select("a", 3);
  assert.equal(p.weapon, "knife");
});
test("knife damage is range-limited and does not consume ammunition", () => {
  const g = setup(),
    a = g.players.get("a"),
    b = g.players.get("b");
  g.phase = "live";
  g.end = 100;
  g.select("a", 3);
  a.x = -18;
  g.time = a.equipUntil;
  a.z = 0;
  a.yaw = 0;
  b.x = -18;
  b.z = -5;
  g.shoot(a);
  assert.equal(b.hp, 100);
  g.time++;
  b.z = -1.5;
  g.shoot(a);
  assert.ok(b.hp < 100);
  assert.equal(a.ammo, 1);
});
test("dropping the core lets a teammate pick it up", () => {
  const g = setup(),
    p = g.players.get("a");
  const ally = g.add("c", "Ally");
  g.phase = "live";
  g.end = 100;
  ally.alive = true;
  ally.x = p.x;
  ally.z = p.z;
  assert.equal(g.dropCore("a"), true);
  g.tick(1 / 60);
  assert.equal(g.spike.carrier, "c");
});
test("malformed item and agent values cannot invoke object prototypes", () => {
  const g = setup();
  assert.equal(g.buy("a", { toString: null }), false);
  assert.equal(g.buy("a", "__proto__"), false);
  assert.equal(g.add("c", "C", "__proto__").agent, "veil");
});
