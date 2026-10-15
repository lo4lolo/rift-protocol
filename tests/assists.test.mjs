import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("ASSIST");
  const a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  g.phase = "live";
  return { g, a, b, c };
}
test("damage assist aggregates weapons and regions at the threshold, only once", () => {
  const { g, a, b, c } = setup();
  b.armor = 50;
  g.damage(b, 20, c, false, "pistol", "legs");
  g.damage(b, 30, c, false, "충격 파동");
  const credits = c.credits,
    ultimate = c.ultimate;
  g.damage(b, 500, a, true);
  assert.equal(c.assists, 1);
  assert.equal(a.assists, 0);
  assert.equal(a.kills, 1);
  assert.equal(c.credits, credits);
  assert.equal(c.ultimate, ultimate);
  g.damage(b, 500, a);
  assert.equal(c.assists, 1);
  for (const viewer of [a.id, b.id, c.id, "unknown"])
    assert.equal(
      g.snapshot(viewer).players.find((p) => p.id === c.id).assists,
      1,
    );
});
test("subthreshold and invalid damage do not grant assists; a dead helper retains contribution", () => {
  const { g, a, b, c } = setup();
  g.damage(b, 49.99, c);
  g.damage(b, 500, a);
  assert.equal(c.assists, 0);
  g.nextRound();
  g.phase = "live";
  g.damage(b, 0, c);
  g.damage(b, NaN, c);
  g.damage(c, 50, a);
  g.damage(b, 50, c);
  c.alive = false;
  c.connected = false;
  g.damage(b, 500, a);
  assert.equal(c.assists, 1);
});
test("round boundaries clear contributions but preserve totals; rematch resets totals", () => {
  const { g, a, b, c } = setup();
  g.damage(b, 50, c);
  g.nextRound();
  g.phase = "live";
  g.damage(b, 500, a);
  assert.equal(c.assists, 0);
  g.nextRound();
  g.phase = "live";
  g.damage(b, 50, c);
  g.damage(b, 500, a);
  assert.equal(c.assists, 1);
  g.nextRound();
  assert.equal(c.assists, 1);
  g.phase = "match";
  g.start(a.id);
  assert.equal(c.assists, 0);
});
