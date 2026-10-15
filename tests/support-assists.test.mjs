import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup(agent = "pulse") {
  const g = new Game("SUPPORT"),
    a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  g.phase = "live";
  c.agent = agent;
  c.secondary = 1;
  Object.assign(c, { x: -18, z: 0, yaw: 0 });
  Object.assign(b, { x: -18, z: -4 });
  return { g, a, b, c };
}
test("actual reveal and flash award one assist, even alongside qualifying damage", () => {
  for (const agent of ["pulse", "veil"]) {
    const { g, a, b, c } = setup(agent);
    g.ability(c.id, agent === "veil" ? "secondary" : "signature");
    assert.ok(b.supportContributions.get(c.id) > g.time);
    g.damage(b, 50, c);
    g.damage(b, 500, a);
    assert.equal(c.assists, 1);
  }
});
test("expired, blocked, and prior-round support cannot award an assist", () => {
  for (const mode of ["expired", "blocked", "round"]) {
    const { g, a, b, c } = setup("veil");
    if (mode === "blocked") b.z = 4;
    g.ability(c.id, "secondary");
    if (mode === "expired") g.time = 2;
    if (mode === "round") {
      g.nextRound();
      g.phase = "live";
    }
    g.damage(b, 500, a);
    assert.equal(c.assists, 0, mode);
  }
});
test("short reveal cannot shorten an existing ultimate or extend another source's attribution", () => {
  const { g, a, b, c } = setup();
  a.agent = "pulse";
  a.ultimate = 99;
  g.ability(a.id, "ultimate");
  g.time = 1;
  g.ability(c.id);
  assert.equal(b.revealUntil, 8);
  assert.equal(b.supportContributions.get(c.id), 5);
  g.time = 5;
  g.damage(b, 500, a);
  assert.equal(c.assists, 0);
  assert.equal(a.assists, 0);
  for (const viewer of [a.id, b.id, c.id, null])
    assert.ok(
      g.snapshot(viewer).players.every((p) => !("supportContributions" in p)),
    );
});
