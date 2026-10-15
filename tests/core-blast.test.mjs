import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("BLAST"),
    a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start(a.id);
  g.phase = "live";
  g.end = 1;
  Object.assign(g.spike, { planted: true, carrier: null, x: 0, z: 0 });
  for (const p of [a, b])
    Object.assign(p, {
      x: 0,
      z: 0,
      primary: "rifle",
      weapon: "rifle",
      armor: 50,
    });
  Object.assign(c, { x: 20, z: 0, primary: "smg", weapon: "smg" });
  return { g, a, b, c };
}
test("detonation kills either team, drops weapons and grants no player kill credit", () => {
  const { g, a, b, c } = setup();
  g.time = 1;
  g.tick(1 / 60);
  assert.equal(g.phase, "end");
  assert.equal(g.winner, 0);
  assert.deepEqual(g.score, [1, 0]);
  for (const p of [a, b]) {
    assert.equal(p.alive, false);
    assert.equal(p.deaths, 1);
    assert.equal(p.kills, 0);
    assert.equal(p.assists, 0);
    assert.equal(p.combatReport[0].health + p.combatReport[0].armor, 150);
  }
  assert.equal(c.alive, true);
  assert.equal(c.primary, "smg");
  assert.equal(g.drops.length, 2);
  assert.equal(a.credits, 3800);
  assert.equal(b.credits, 2700);
  const deaths = a.deaths;
  assert.equal(g.detonateCore(), false);
  g.tick(1 / 60);
  assert.equal(a.deaths, deaths);
  assert.equal(g.events.filter((e) => e.type === "detonate").length, 1);
});
test("blast falls off at range, applies armor and ignores walls", () => {
  const { g, a, b } = setup();
  Object.assign(a, { x: 14, z: 0 });
  Object.assign(b, { x: -18, z: 0 });
  g.time = 1;
  assert.equal(g.detonateCore(), true);
  assert.ok(Math.abs(a.hp - 78.75) < 1e-8);
  assert.ok(Math.abs(a.armor - 8.75) < 1e-8);
  assert.equal(b.hp, 100);
  assert.equal(b.armor, 50);
});
test("unplanted, early or defused core cannot detonate", () => {
  const { g, a } = setup();
  assert.equal(g.detonateCore(), false);
  g.time = 1;
  g.spike.planted = false;
  assert.equal(g.detonateCore(), false);
  g.spike.planted = true;
  g.finish(1, "코어 해체");
  assert.equal(g.detonateCore(), false);
  assert.equal(a.hp, 100);
});

test("elimination schedules aftermath blast without duplicate victory and clears dead equipment", () => {
  const { g, a, b, c } = setup();
  g.end = 40;
  b.alive = false;
  g.tick(1 / 60);
  assert.equal(g.phase, "end");
  assert.equal(g.spike.detonateAt, g.time + 4);
  const credits = a.credits;
  for (let i = 0; i < 250; i++) g.tick(1 / 60);
  assert.equal(a.alive, false);
  assert.equal(a.primary, null);
  assert.equal(a.armor, 0);
  assert.equal(c.alive, true);
  assert.equal(c.primary, "smg");
  assert.deepEqual(g.score, [1, 0]);
  assert.equal(g.roundHistory.length, 1);
  assert.equal(a.credits, credits);
  assert.equal(g.events.filter((e) => e.type === "result").length, 1);
  for (let i = 0; i < 120; i++) g.tick(1 / 60);
  assert.equal(g.phase, "buy");
  assert.equal(a.primary, null);
  assert.equal(c.primary, "smg");
  assert.equal(g.spike.detonateAt, undefined);
});

test("aftermath permits authoritative movement but not shooting or defuse", () => {
  const { g, a, b } = setup();
  g.end = 40;
  b.alive = false;
  g.tick(1 / 60);
  const x = a.x;
  a.commands.push({
    seq: 1,
    yaw: -Math.PI / 2,
    pitch: 0,
    w: true,
    received: g.time,
  });
  g.consumeCommand(a, 1 / 30);
  assert.ok(a.x > x);
  const ammo = a.ammo;
  g.shoot(a);
  assert.equal(a.ammo, ammo);
});
