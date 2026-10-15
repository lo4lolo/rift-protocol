import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";

test("light shield and heavy replacement unwind separately without free armor or credits", () => {
  const { g, a } = setup();
  a.armor = 10;
  assert.equal(g.buy(a.id, "lightArmor"), true);
  assert.equal(a.armor, 25);
  assert.equal(a.credits, 8600);
  assert.equal(g.buy(a.id, "lightArmor"), false);
  assert.equal(g.buy(a.id, "armor"), true);
  assert.equal(a.credits, 7600);
  assert.equal(g.buy(a.id, "lightArmor"), false);
  assert.equal(g.refundEquipment(a.id, "armor"), true);
  assert.equal(a.armor, 25);
  assert.equal(a.credits, 8600);
  assert.equal(g.refundEquipment(a.id, "armor"), true);
  assert.equal(a.armor, 10);
  assert.equal(a.credits, 9000);
  assert.equal(g.refundEquipment(a.id, "armor"), false);
});

test("light shield blocks insufficient funds and live purchases; damage invalidates refund", () => {
  const { g, a, b } = setup();
  a.credits = 399;
  assert.equal(g.buy(a.id, "lightArmor"), false);
  a.credits = 400;
  assert.equal(g.buy(a.id, "lightArmor"), true);
  assert.equal(
    g.snapshot(a.id).players.find((p) => p.id === a.id).refundableArmor,
    true,
  );
  a.armor = 20;
  assert.equal(g.refundEquipment(a.id, "armor"), false);
  g.phase = "live";
  a.credits = 9000;
  assert.equal(g.buy(a.id, "lightArmor"), false);
  assert.equal(g.refundEquipment(a.id, "armor"), false);
  g.nextRound();
  assert.equal(a.armor, 20);
  assert.equal(g.refundEquipment(a.id, "armor"), false);
});
test("armor refund restores damaged carried armor and cannot mint credits", () => {
  const { g, a } = setup();
  a.armor = 17;
  assert.equal(g.refundEquipment(a.id, "armor"), false);
  for (let i = 0; i < 3; i++) {
    assert.equal(g.buy(a.id, "armor"), true);
    assert.equal(a.armor, 50);
    assert.equal(g.refundEquipment(a.id, "armor"), true);
    assert.equal(a.armor, 17);
    assert.equal(a.credits, 9000);
    assert.equal(g.refundEquipment(a.id, "armor"), false);
  }
});
test("ability refunds preserve carried charges and only unwind this buy phase", () => {
  const { g, a } = setup();
  a.secondary = 1;
  assert.equal(g.buy(a.id, "secondary"), true);
  assert.equal(g.refundEquipment(a.id, "secondary"), true);
  assert.equal(a.secondary, 1);
  assert.equal(a.credits, 9000);
  assert.equal(g.refundEquipment(a.id, "secondary"), false);
  g.buy(a.id, "secondary");
  g.time = g.end;
  g.tick(1 / 60);
  assert.equal(g.refundEquipment(a.id, "secondary"), false);
  assert.deepEqual(a.secondaryPurchases, []);
  g.nextRound();
  assert.equal(g.refundEquipment(a.id, "secondary"), false);
});
test("equipment refund eligibility is private and rejects invalid items and unavailable players", () => {
  const { g, a, b, c } = setup();
  g.buy(a.id, "armor");
  g.buy(a.id, "secondary");
  const own = g.snapshot(a.id).players.find((p) => p.id === a.id);
  assert.equal(own.refundableArmor, true);
  assert.equal(own.refundableSecondary, 1);
  for (const viewer of [b.id, c.id, "unknown"]) {
    const p = g.snapshot(viewer).players.find((p) => p.id === a.id);
    for (const key of [
      "refundableArmor",
      "refundableSecondary",
      "armorPurchase",
      "secondaryPurchases",
    ])
      assert.ok(!(key in p));
  }
  for (const item of [null, {}, "__proto__", "rifle"])
    assert.equal(g.refundEquipment(a.id, item), false);
  a.alive = false;
  assert.equal(g.refundEquipment(a.id, "armor"), false);
  a.alive = true;
  a.connected = false;
  assert.equal(g.refundEquipment(a.id, "secondary"), false);
});
function setup() {
  const g = new Game("REFUND"),
    a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start(a.id);
  a.credits = 9000;
  c.credits = 9000;
  return { g, a, b, c };
}
test("refund unwinds sequential purchases and restores old inventory without duplicating money", () => {
  const { g, a } = setup();
  a.primary = a.weapon = "smg";
  a.ammo = 7;
  a.reserve = 21;
  assert.equal(g.buy(a.id, "rifle"), true);
  const afterRifle = a.credits;
  assert.equal(g.buy(a.id, "sniper"), true);
  assert.equal(g.refundWeapon(a.id), true);
  assert.equal(a.primary, "rifle");
  assert.equal(a.credits, afterRifle);
  assert.equal(g.refundWeapon(a.id), true);
  assert.equal(a.primary, "smg");
  assert.equal(a.credits, 9000);
  assert.equal(a.ammo, 7);
  assert.equal(a.reserve, 21);
  assert.equal(g.refundWeapon(a.id), false);
  assert.equal(a.credits, 9000);
});
test("refund while holding a sidearm preserves its ammo and exposes eligibility only to owner", () => {
  const { g, a, b, c } = setup();
  a.ammo = 5;
  a.reserve = 8;
  g.buy(a.id, "rifle");
  g.select(a.id, 2);
  assert.equal(
    g.snapshot(a.id).players.find((p) => p.id === a.id).refundableWeapon,
    "rifle",
  );
  for (const viewer of [b.id, c.id, "unknown"]) {
    const p = g.snapshot(viewer).players.find((p) => p.id === a.id);
    assert.ok(!("refundableWeapon" in p));
    assert.ok(!("weaponPurchases" in p));
  }
  g.refundWeapon(a.id);
  assert.equal(a.primary, null);
  assert.equal(a.weapon, "pistol");
  assert.equal(a.ammo, 5);
  assert.equal(a.reserve, 8);
});
test("sponsored, carried, live, dead and disconnected inventory cannot be refunded", () => {
  const { g, a, c } = setup();
  g.requestWeapon(a.id, "rifle");
  g.sponsorWeapon(c.id, a.id, "rifle");
  assert.equal(g.refundWeapon(a.id), false);
  g.buy(a.id, "smg");
  a.alive = false;
  assert.equal(g.refundWeapon(a.id), false);
  a.alive = true;
  a.connected = false;
  assert.equal(g.refundWeapon(a.id), false);
  a.connected = true;
  g.time = g.end;
  g.tick(1 / 60);
  assert.equal(g.phase, "live");
  assert.equal(g.refundWeapon(a.id), false);
  assert.deepEqual(a.weaponPurchases, []);
  g.nextRound();
  assert.equal(g.refundWeapon(a.id), false);
});
