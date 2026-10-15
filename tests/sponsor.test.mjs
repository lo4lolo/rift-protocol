import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("GIFTS");
  const a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  a.credits = b.credits = 9000;
  return { g, a, b, c };
}
test("teammate sponsorship spends payer funds once, preserves recipient funds and equips requested weapon", () => {
  const { g, a, c } = setup();
  c.ammo = 7;
  assert.equal(g.requestWeapon("c", "rifle"), true);
  assert.equal(g.sponsorWeapon("a", "c", "rifle"), true);
  assert.equal(a.credits, 6100);
  assert.equal(c.credits, 800);
  assert.equal(c.primary, "rifle");
  assert.equal(c.ammo, 25);
  assert.equal(c.magazines.pistol.ammo, 7);
  assert.ok(c.equipUntil > g.time);
  assert.equal(c.requestedWeapon, null);
  assert.equal(g.sponsorWeapon("a", "c", "rifle"), false);
  assert.equal(a.credits, 6100);
});
test("requests enforce phase, team, connection, funds, item and stale cancellation boundaries", () => {
  const { g, a, b, c } = setup();
  for (const item of ["armor", "__proto__", {}, "pistol"])
    assert.equal(g.requestWeapon("c", item), false);
  g.requestWeapon("c", "sniper");
  assert.equal(g.sponsorWeapon("b", "c", "sniper"), false);
  assert.equal(g.sponsorWeapon("c", "c", "sniper"), false);
  assert.equal(g.sponsorWeapon("a", "c", "rifle"), false);
  a.credits = 100;
  assert.equal(g.sponsorWeapon("a", "c", "sniper"), false);
  a.credits = 9000;
  c.connected = false;
  assert.equal(g.sponsorWeapon("a", "c", "sniper"), false);
  c.connected = true;
  g.requestWeapon("c", null);
  assert.equal(g.sponsorWeapon("a", "c", "sniper"), false);
  g.requestWeapon("c", "smg");
  assert.equal(
    g.snapshot("a").players.find((p) => p.id === "c").requestedWeapon,
    "smg",
  );
  assert.ok(
    !("requestedWeapon" in g.snapshot("b").players.find((p) => p.id === "c")),
  );
  g.time = g.end;
  g.tick(1 / 60);
  assert.equal(c.requestedWeapon, null);
  assert.equal(g.requestWeapon("c", "smg"), false);
  assert.equal(g.sponsorWeapon("a", "c", "smg"), false);
  assert.equal(a.credits, 9000);
  assert.equal(b.credits, 9000);
});
test("own purchase and new rounds cancel requests; owned primary cannot be silently replaced", () => {
  const { g, c } = setup();
  g.requestWeapon("c", "smg");
  c.credits = 5000;
  g.buy("c", "rifle");
  assert.equal(c.requestedWeapon, null);
  assert.equal(g.requestWeapon("c", "sniper"), false);
  assert.equal(g.sponsorWeapon("a", "c", "smg"), false);
  g.players.get("a").requestedWeapon = "smg";
  g.nextRound();
  assert.equal(g.players.get("a").requestedWeapon, null);
});
