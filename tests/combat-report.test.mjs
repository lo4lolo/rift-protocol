import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("REPORT");
  const a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  g.phase = "live";
  return { g, a, b, c };
}
test("report counts actual shield and health loss, aggregates hits and caps overkill", () => {
  const { g, a, b } = setup();
  b.armor = 50;
  g.damage(b, 20, a);
  g.damage(b, 20, a);
  assert.equal(a.combatReport[0].hits, 2);
  assert.ok(Math.abs(a.combatReport[0].armor - 26.4) < 1e-8);
  g.damage(b, 500, a, true);
  assert.equal(b.alive, false);
  const total = a.combatReport.reduce((n, r) => n + r.health + r.armor, 0);
  assert.ok(Math.abs(total - 150) < 1e-8);
  assert.equal(a.combatReport[1].region, "head");
  assert.deepEqual(
    a.combatReport.map((r) => ({
      ...r,
      opponent: "a",
      name: "A",
      direction: "in",
    })),
    b.combatReport,
  );
  g.damage(b, 50, a);
  assert.equal(a.combatReport.length, 2);
});
test("report never leaks to living self, allies, opponents or unknown viewers", () => {
  const { g, a, b, c } = setup();
  g.damage(a, 10, b);
  const report = (viewer) =>
    g.snapshot(viewer).players.find((p) => p.id === a.id).combatReport;
  for (const viewer of [a.id, b.id, c.id, "unknown"])
    assert.equal(report(viewer), undefined);
  g.damage(a, 500, b);
  assert.equal(report(a.id)[0].hits, 2);
  for (const viewer of [b.id, c.id, "unknown"])
    assert.equal(report(viewer), undefined);
  g.phase = "end";
  assert.ok(
    g.snapshot(b.id).players.find((p) => p.id === b.id).combatReport.length,
  );
  g.nextRound();
  assert.deepEqual(a.combatReport, []);
  assert.equal(report(a.id), undefined);
});
test("invalid and friendly damage is excluded; abilities and hit regions remain distinct", () => {
  const { g, a, b, c } = setup();
  for (const n of [0, -1, NaN, Infinity]) g.damage(a, n, b);
  g.damage(a, 10, c);
  assert.deepEqual(a.combatReport, []);
  g.damage(a, 10, b, false, "충격 파동");
  g.damage(a, 10, b, false, "rifle", "legs");
  assert.deepEqual(
    a.combatReport.map((r) => r.region),
    ["ability", "legs"],
  );
});
