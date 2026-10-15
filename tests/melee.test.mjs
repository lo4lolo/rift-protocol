import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { isBackstab } from "../ballistics.mjs";
test("rear cone excludes front, side and overlapping positions", () => {
  const attacker = { x: 0, z: 0 };
  assert.equal(isBackstab(attacker, { x: 0, z: -1, yaw: 0 }), true);
  for (const yaw of [Math.PI, Math.PI / 2, -Math.PI / 2])
    assert.equal(isBackstab(attacker, { x: 0, z: -1, yaw }), false);
  assert.equal(isBackstab(attacker, { x: 0, z: 0, yaw: 0 }), false);
});
test("rear melee doubles damage, preserves armor accounting and never boosts firearms", () => {
  for (const weapon of ["knife", "pistol"]) {
    const { g, a, b } = setup();
    b.yaw = 0;
    b.armor = 50;
    a.weapon = weapon;
    g.shoot(a, weapon === "knife");
    const event = g.events.find((e) => e.type === "shot");
    assert.equal(event.backstab, weapon === "knife");
    if (weapon === "knife") {
      assert.equal(b.alive, false);
      assert.equal(a.combatReport[0].health + a.combatReport[0].armor, 150);
    } else assert.ok(Math.abs(b.hp + b.armor - 124) < 1e-8);
  }
});
test("rear attack uses the same rewound orientation as its hitbox", () => {
  const { g, a, b } = setup();
  g.time = 1;
  b.yaw = 0;
  g.recordHistory();
  g.time = 1.2;
  b.yaw = Math.PI;
  a.input.viewTime = 1;
  g.shoot(a, true);
  assert.equal(b.alive, false);
  assert.equal(g.events.find((e) => e.type === "shot").backstab, true);
  const next = setup();
  next.g.time = 1;
  next.b.yaw = Math.PI;
  next.g.recordHistory();
  next.g.time = 1.2;
  next.b.yaw = 0;
  next.a.input.viewTime = 1;
  next.g.shoot(next.a, true);
  assert.equal(next.b.hp, 25);
  assert.equal(next.g.events.find((e) => e.type === "shot").backstab, false);
});
function setup() {
  const g = new Game("MELEE", { random: () => 0.5 }),
    a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start(a.id);
  g.phase = "live";
  Object.assign(a, {
    x: -18,
    z: 0,
    yaw: 0,
    pitch: -0.1,
    weapon: "knife",
    ammo: 1,
  });
  Object.assign(b, { x: -18, z: -1.5, armor: 0 });
  return { g, a, b };
}
test("hidden melee uses short-range non-positional sound instead of gunshot disclosure", () => {
  const { g, a, b } = setup();
  b.z = 6;
  g.shoot(a, true);
  const heard = g.snapshot(b.id).events.filter((e) => e.type === "sound");
  assert.equal(heard.length, 1);
  assert.equal(heard[0].kind, "melee");
  assert.ok(!("from" in heard[0]));
  assert.ok(!("player" in heard[0]));
  b.z = 10;
  assert.equal(
    g.snapshot(b.id).events.filter((e) => e.type === "sound").length,
    0,
  );
});
test("heavy melee is stronger, consumes no ammunition and shares cooldown", () => {
  const { g, a, b } = setup();
  g.shoot(a, true);
  assert.equal(b.hp, 25);
  assert.equal(a.ammo, 1);
  const e = g.events.find((e) => e.type === "shot");
  assert.equal(e.weapon, "knife");
  assert.equal(e.alternate, true);
  assert.ok(e.to.every(Number.isFinite));
  g.time = 0.6;
  g.shoot(a);
  assert.equal(b.hp, 25);
  g.time = 1;
  g.shoot(a);
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
});
test("heavy melee obeys range, walls and equip lock", () => {
  for (const mode of ["range", "wall", "equip"]) {
    const { g, a, b } = setup();
    if (mode === "range") b.z = -3;
    if (mode === "wall") {
      Object.assign(a, { x: -11, z: 27.1 });
      Object.assign(b, { x: -11, z: 25.1 });
    }
    if (mode === "equip") a.equipUntil = 1;
    g.shoot(a, true);
    assert.equal(b.hp, 100, mode);
  }
});
test("holding heavy attack requires a new press and simultaneous buttons cannot double-hit", () => {
  const { g, a, b } = setup();
  a.input = { fire: true, altFire: true, altPressed: true };
  g.trigger(a);
  assert.equal(b.hp, 25);
  a.input = { altFire: true };
  g.time = 2;
  g.trigger(a);
  assert.equal(b.hp, 25);
  a.input = {};
  g.trigger(a);
  a.input = { altFire: true };
  g.trigger(a);
  assert.equal(b.alive, false);
});
