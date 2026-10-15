import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { AGENTS, blocked } from "../shared.mjs";
function setup(agent = "veil") {
  const g = new Game("SKILL", { random: () => 0.5 });
  const a = g.add("a", "A", agent),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start("a");
  Object.assign(a, { x: -18, z: 0, yaw: 0 });
  Object.assign(b, { x: -18, z: -5 });
  Object.assign(c, { x: -18, z: -3 });
  return { g, a, b, c };
}
test("secondary purchases enforce price, capacity, phase and preserve unspent charges", () => {
  const { g, a } = setup();
  assert.equal(g.buy("a", "secondary"), true);
  assert.equal(a.credits, 550);
  assert.equal(g.buy("a", "secondary"), true);
  assert.equal(g.buy("a", "secondary"), false);
  g.phase = "live";
  assert.equal(g.buy("a", "secondary"), false);
  assert.equal(g.ability("a", "secondary"), true);
  assert.equal(a.secondary, 1);
  g.nextRound();
  assert.equal(a.secondary, 1);
  assert.equal(a.skill, 1);
  a.credits = 0;
  assert.equal(g.buy("a", "secondary"), false);
  g.round = 12;
  g.nextRound();
  assert.equal(a.secondary, 0);
  assert.equal(a.ultimate, 0);
});
test("flash respects walls, angle, team, phase and spent charges", () => {
  const { g, a, b, c } = setup();
  a.secondary = 2;
  assert.equal(g.ability("a", "secondary"), false);
  g.phase = "live";
  assert.equal(g.ability("a", {}), false);
  assert.equal(g.ability("a", "secondary"), true);
  assert.equal(b.blindUntil, 2);
  assert.equal(c.blindUntil, 0);
  b.blindUntil = 0;
  b.z = 5;
  g.ability("a", "secondary");
  assert.equal(b.blindUntil, 0);
  assert.equal(g.ability("a", "secondary"), false);
  a.secondary = 1;
  a.x = 0;
  a.z = 0;
  b.x = 0;
  b.z = -9;
  g.ability("a", "secondary");
  assert.equal(b.blindUntil, 0);
});
test("shock damage applies armor, kills once, drops equipment and awards bounded points", () => {
  const { g, a, b, c } = setup("pulse");
  g.phase = "live";
  a.secondary = 2;
  b.armor = 50;
  g.ability("a", "secondary");
  assert.ok(Math.abs(b.hp - 84.7) < 1e-6);
  assert.equal(c.hp, 100);
  b.armor = 0;
  b.hp = 40;
  b.primary = "rifle";
  g.ability("a", "secondary");
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
  assert.equal(g.drops.length, 1);
  assert.equal(a.ultimate, 1);
  assert.equal(b.ultimate, 1);
  g.damage(b, 100, a);
  assert.equal(a.kills, 1);
  for (let i = 0; i < 20; i++) g.awardUltimate(a);
  assert.equal(a.ultimate, AGENTS.pulse.ultimate.points);
});
test("updraft rises and falls even when the client stops sending commands", () => {
  const { g, a } = setup("dash");
  g.phase = "live";
  a.secondary = 1;
  assert.equal(g.ability("a", "secondary"), true);
  for (let i = 0; i < 20; i++) g.tick(1 / 60);
  assert.ok(a.y > 1.5);
  for (let i = 0; i < 100; i++) g.tick(1 / 60);
  assert.equal(a.y, 0);
});
test("ultimates consume server points, cannot cross walls, reveal enemies and expire focus", () => {
  for (const agent of Object.keys(AGENTS)) {
    const { g, a, b, c } = setup(agent);
    g.phase = "live";
    assert.equal(g.ability("a", "ultimate"), false);
    a.ultimate = AGENTS[agent].ultimate.points;
    a.x = 0;
    a.z = 0;
    if (agent === "haven") a.hp = 40;
    assert.equal(g.ability("a", "ultimate"), true);
    assert.equal(a.ultimate, 0);
    assert.equal(g.ability("a", "ultimate"), false);
    if (agent === "veil") {
      assert.ok(a.z > -3.2);
      assert.equal(blocked(a.x, a.z), false);
    }
    if (agent === "pulse") {
      assert.equal(b.revealUntil, 8);
      assert.equal(c.revealUntil, 0);
    }
    if (agent === "dash") {
      assert.equal(a.skill, 2);
      assert.equal(a.focusUntil, 12);
    }
    if (agent === "haven") assert.equal(a.hp, 100);
    g.nextRound();
    assert.equal(a.focusUntil, 0);
  }
});
test("plant and defuse each award one ultimate point; rematch clears inventory and points", () => {
  const { g, a, b } = setup();
  g.phase = "live";
  a.x = -19;
  a.z = -16;
  a.input = { use: true };
  a.lastInput = 100;
  a.progress = g.cfg.plant;
  g.tick(1 / 60);
  assert.equal(g.spike.planted, true);
  assert.equal(a.ultimate, 1);
  b.x = a.x;
  b.z = a.z;
  b.input = { use: true };
  b.lastInput = 100;
  b.progress = g.cfg.defuse;
  g.tick(1 / 60);
  assert.equal(g.phase, "end");
  assert.equal(b.ultimate, 1);
  a.secondary = 2;
  g.phase = "match";
  g.start("a");
  assert.equal(a.secondary, 0);
  assert.equal(a.ultimate, 0);
});
