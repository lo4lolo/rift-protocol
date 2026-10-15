import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { shotProfile } from "../shared.mjs";
test("landing spread smoothly returns to standing accuracy without blocking fire", () => {
  const g = new Game("LAND"),
    a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start(a.id);
  g.phase = "live";
  g.end = 100;
  Object.assign(a, {
    x: -18,
    z: 0,
    y: 0.01,
    vy: -2,
    weapon: "rifle",
    ammo: 25,
  });
  g.tick(1 / 30);
  assert.equal(a.y, 0);
  assert.ok(a.landingUntil > g.time);
  const base = shotProfile(a.weapon, { ...a, landingUntil: 0 }, g.time).spread;
  const impact = shotProfile(a.weapon, a, g.time).spread;
  const halfway = shotProfile(a.weapon, a, g.time + 0.09).spread;
  assert.ok(Math.abs(impact - base * 3) < 1e-8);
  assert.ok(Math.abs(halfway - base * 2) < 1e-8);
  g.shoot(a);
  assert.equal(a.ammo, 24);
  for (let i = 0; i < 20; i++) g.tick(1 / 60);
  assert.equal(
    shotProfile(a.weapon, a, g.time).spread,
    shotProfile(a.weapon, { ...a, landingUntil: 0 }, g.time).spread,
  );
  assert.ok(
    !("landingUntil" in g.snapshot(b.id).players.find((p) => p.id === a.id)),
  );
  assert.equal(
    g.snapshot(a.id).players.find((p) => p.id === a.id).landingUntil,
    a.landingUntil,
  );
  g.nextRound();
  assert.equal(a.landingUntil, 0);
});
test("ground movement never renews landing penalty and bots get the same landing rule", () => {
  const g = new Game("LAND2"),
    a = g.add("a", "A", "veil", true);
  g.owner = a.id;
  g.start(a.id);
  g.phase = "live";
  g.end = 100;
  g.tick(1 / 60);
  assert.equal(a.landingUntil, 0);
  a.y = 0.01;
  a.vy = -2;
  g.tick(1 / 60);
  const end = a.landingUntil;
  assert.ok(end > g.time);
  g.tick(1 / 60);
  assert.equal(a.landingUntil, end);
});
