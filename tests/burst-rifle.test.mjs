import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("BURST", { random: () => 0.5 }),
    a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start(a.id);
  a.credits = 9000;
  assert.equal(g.buy(a.id, "burstRifle"), true);
  g.time = 1;
  g.phase = "live";
  g.end = 100;
  Object.assign(a, { x: -18, z: 0, yaw: 0, pitch: -0.06 });
  Object.assign(b, { x: -18, z: -4, hp: 500 });
  return { g, a, b };
}
test("burst fires three temporally separated bullets and charges only actual shots", () => {
  const { g, a, b } = setup();
  g.shoot(a);
  assert.equal(a.ammo, 23);
  assert.equal(b.hp, 468);
  g.time += 0.04;
  g.advanceBurst(a);
  assert.equal(a.ammo, 23);
  g.time += 0.04;
  g.advanceBurst(a);
  assert.equal(a.ammo, 22);
  assert.equal(b.hp, 436);
  g.time += 0.08;
  g.advanceBurst(a);
  assert.equal(a.ammo, 21);
  assert.equal(b.hp, 404);
  assert.equal(a.queuedBurst, null);
  assert.equal(g.events.filter((e) => e.type === "shot").length, 3);
  g.shoot(a);
  assert.equal(a.ammo, 21);
});
test("reload, equipment switch, death, disconnect and round finish cancel remaining bullets", () => {
  for (const cancel of [
    (g, a) => g.reload(a.id),
    (g, a) => g.select(a.id, 2),
    (g, a) => {
      a.alive = false;
    },
    (g, a) => {
      a.connected = false;
    },
    (g, a) => g.finish(0, "test"),
  ]) {
    const { g, a } = setup();
    g.shoot(a);
    cancel(g, a);
    const ammo = a.ammo;
    g.time += 0.2;
    g.advanceBurst(a);
    assert.equal(a.ammo, ammo);
    assert.equal(a.queuedBurst, null);
    assert.equal(g.events.filter((e) => e.type === "shot").length, 1);
  }
});
test("last shell and held semi trigger cannot produce extra bullets; ticks execute scheduled burst", () => {
  const { g, a } = setup();
  a.ammo = 1;
  g.shoot(a);
  g.time += 0.1;
  g.advanceBurst(a);
  assert.equal(a.ammo, 0);
  assert.equal(a.queuedBurst, null);
  a.ammo = 24;
  g.time += 1;
  a.input = { fire: true, firePressed: true };
  a.lastInput = 100;
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  assert.equal(a.ammo, 21);
  assert.equal(a.queuedBurst, null);
});
