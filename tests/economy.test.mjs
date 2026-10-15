import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("ECON");
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start("a");
  const finish = (winner, planted = false) => {
    a.credits = b.credits = 0;
    g.phase = "live";
    g.spike.planted = planted;
    g.finish(winner, "test");
  };
  return { g, a, b, finish };
}
test("consecutive losses pay 1900, 2400, 2900 and cap; a win resets the losing team's tier", () => {
  const { g, a, b, finish } = setup();
  for (const expected of [1900, 2400, 2900, 2900]) {
    finish(1);
    assert.equal(a.credits, expected);
    assert.equal(b.credits, 3000);
  }
  assert.equal(g.snapshot("a").economy.nextLossBonus[0], 2900);
  finish(0);
  assert.equal(g.lossStreak[0], 0);
  finish(1);
  assert.equal(a.credits, 1900);
  const before = a.credits;
  g.finish(1, "duplicate");
  assert.equal(a.credits, before);
});
test("losing planted attack team gets plant bonus exactly once and credits respect the cap", () => {
  const { g, a, b, finish } = setup();
  const c = g.add("c", "C");
  g.nextRound(); // The added teammate must actually enter a round to earn its rewards.
  c.credits = 0;
  finish(1, true);
  assert.equal(a.credits, 2700);
  assert.equal(c.credits, 2700);
  assert.equal(b.credits, 3000);
  finish(0, true);
  assert.equal(a.credits, 3000);
  assert.equal(b.credits, 1900);
  a.credits = 8900;
  g.phase = "live";
  g.finish(1, "test");
  assert.equal(a.credits, 9000);
});
test("halftime, overtime and rematch reset loss tiers alongside their starting credits", () => {
  const { g, a, finish } = setup();
  finish(1);
  finish(1);
  g.round = 12;
  g.nextRound();
  assert.equal(a.team, 1);
  assert.equal(a.credits, 800);
  assert.deepEqual(g.lossStreak, [0, 0]);
  g.lossStreak = [3, 2];
  g.overtime = true;
  g.round = 24;
  g.nextRound();
  assert.equal(a.credits, 5000);
  assert.deepEqual(g.lossStreak, [0, 0]);
  g.lossStreak = [2, 3];
  g.phase = "match";
  g.start("a");
  assert.equal(a.credits, 800);
  assert.deepEqual(g.lossStreak, [0, 0]);
});
