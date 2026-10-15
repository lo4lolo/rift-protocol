import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { WEAPONS } from "../shared.mjs";
function setup(weapon = "pistol") {
  const g = new Game("TRIGGER", { buy: 100, random: () => 0.5 });
  const p = g.add("a", "A");
  g.add("b", "B");
  g.start("a");
  g.phase = "live";
  g.end = 100;
  p.weapon = weapon;
  p.ammo = WEAPONS[weapon].mag;
  let seq = 0;
  const input = (data) => {
    g.input(p.id, { seq: ++seq, round: g.round, yaw: 0, pitch: 0, ...data });
    g.tick(1 / 30);
  };
  return { g, p, input };
}
test("pistol and sniper require a new press; automatic weapons repeat at server rate", () => {
  for (const weapon of ["pistol", "sniper", "rifle", "smg"]) {
    const { p, input } = setup(weapon);
    for (let i = 0; i < 60; i++) input({ fire: true });
    const used = WEAPONS[weapon].mag - p.ammo;
    if (WEAPONS[weapon].fireMode === "semi") assert.equal(used, 1);
    else {
      assert.ok(used > 5);
      assert.ok(used <= Math.ceil(2 / WEAPONS[weapon].rate));
    }
    input({ fire: false });
    input({ fire: true });
    if (WEAPONS[weapon].fireMode === "semi")
      assert.equal(p.ammo, WEAPONS[weapon].mag - 2);
  }
});
test("short sampled taps fire once, cannot bypass rate, and are not buffered across reload", () => {
  const { g, p, input } = setup();
  input({ fire: false, firePressed: true });
  assert.equal(p.ammo, 11);
  for (let i = 0; i < 5; i++) input({ firePressed: true });
  assert.equal(p.ammo, 11);
  for (let i = 0; i < 10; i++) input({});
  assert.equal(p.ammo, 11);
  p.reloadUntil = g.time + 0.1;
  input({ fire: true, firePressed: true });
  for (let i = 0; i < 20; i++) input({ fire: true });
  assert.equal(p.ammo, 12);
  input({});
  input({ firePressed: true });
  assert.equal(p.ammo, 11);
});
test("purchase presses are consumed and stale automatic input stops firing", () => {
  const { g, p, input } = setup();
  g.phase = "buy";
  g.end = g.time + 1;
  for (let i = 0; i < 45; i++) input({ fire: true });
  assert.equal(g.phase, "live");
  assert.equal(p.ammo, 12);
  input({});
  input({ fire: true });
  assert.equal(p.ammo, 11);
  const automatic = setup("rifle");
  automatic.input({ fire: true });
  for (let i = 0; i < 30; i++) automatic.g.tick(1 / 60);
  const stopped = automatic.p.ammo;
  for (let i = 0; i < 60; i++) automatic.g.tick(1 / 60);
  assert.equal(automatic.p.ammo, stopped);
  assert.ok(stopped >= 21);
});
