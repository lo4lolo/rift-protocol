import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";

const privateKeys = [
  "hp",
  "armor",
  "credits",
  "primary",
  "ammo",
  "reserve",
  "reloadUntil",
  "equipUntil",
  "requestedWeapon",
  "slow",
  "skill",
  "secondary",
  "ultimate",
  "blindUntil",
  "progress",
  "ack",
  "vy",
  "jumpHeld",
  "burst",
  "lastShot",
  "recoilWeapon",
];
test("recipient snapshots hide opposing inventory while retaining own and teammate state", () => {
  const g = new Game("PRIVATE");
  const a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  assert.equal(a.team, c.team);
  assert.notEqual(a.team, b.team);
  b.hp = 37;
  b.credits = 4321;
  b.ammo = 3;
  for (const p of [a, b, c]) {
    p.x = -18;
    p.z = 8;
  }
  for (const viewer of [a, b, c]) {
    const state = g.snapshot(viewer.id);
    for (const p of state.players) {
      if (p.team === viewer.team) {
        for (const key of privateKeys) assert.ok(key in p, key);
      } else {
        for (const key of privateKeys) assert.ok(!(key in p), key);
        assert.equal(typeof p.x, "number");
        assert.equal(typeof p.weapon, "string");
      }
    }
  }
  assert.equal(g.snapshot().players.find((p) => p.id === "b").hp, 37);
  assert.ok(g.snapshot("missing").players.every((p) => !("hp" in p)));
  // Recompute from current teams after a side change; do not retain old permissions.
  a.team = b.team;
  assert.equal(g.snapshot("a").players.find((p) => p.id === "b").credits, 4321);
  assert.ok(!("credits" in g.snapshot("a").players.find((p) => p.id === "c")));
});
