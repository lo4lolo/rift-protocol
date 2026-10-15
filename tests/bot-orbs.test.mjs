import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { botObjective } from "../tactics.mjs";
import { AGENTS } from "../shared.mjs";
function setup() {
  const g = new Game("BOTORB"),
    a = g.add("a", "A", "veil", true),
    b = g.add("b", "B"),
    c = g.add("c", "C", "pulse", true);
  g.owner = a.id;
  g.start(a.id);
  g.phase = "live";
  g.end = 100;
  g.spike.carrier = "carrier";
  Object.assign(a, { x: -18, z: 10 });
  Object.assign(c, { x: -18, z: 11 });
  Object.assign(b, { x: 18, z: -20 });
  return { g, a, b, c };
}
test("only nearest eligible bot collects; human use, urgency, cap and core duties take priority", () => {
  const { g, a, c } = setup();
  assert.equal(botObjective(g, a).role, "collect");
  assert.notEqual(botObjective(g, c).role, "collect");
  c.bot = false;
  c.z = 8;
  c.input.use = true;
  assert.notEqual(botObjective(g, a).role, "collect");
  c.input.use = false;
  g.end = 10;
  assert.notEqual(botObjective(g, a).role, "collect");
  g.end = 100;
  a.ultimate = AGENTS[a.agent].ultimate.points;
  assert.notEqual(botObjective(g, a).role, "collect");
  a.ultimate = 0;
  g.spike.carrier = a.id;
  assert.equal(botObjective(g, a).role, "plant");
  g.spike.carrier = null;
  assert.equal(botObjective(g, a).role, "recover");
});
test("bot cannot select distant, obscured or consumed orbs", () => {
  const { g, a } = setup();
  g.orbs[0].available = false;
  assert.notEqual(botObjective(g, a).role, "collect");
  g.orbs[0].available = true;
  g.smokes = [{ x: -18, z: 9 }];
  assert.notEqual(botObjective(g, a).role, "collect");
  g.smokes = [];
  a.z = 0;
  assert.notEqual(botObjective(g, a).role, "collect");
});
test("bot approaches inside capture radius, completes collection, then resumes objective", () => {
  const { g, a, c } = setup();
  c.connected = false;
  c.alive = false;
  g.botThink(a);
  assert.equal(a.input.w, true);
  assert.equal(a.input.use, undefined);
  for (let i = 0; i < 260; i++) g.tick(1 / 60);
  assert.equal(g.orbs[0].available, false);
  assert.equal(a.ultimate, 1);
  assert.notEqual(a.botRole, "collect");
});
