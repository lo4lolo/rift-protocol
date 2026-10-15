import test from "node:test";
import assert from "node:assert/strict";
import { smokeBlocks, seesEnemy, botObjective } from "../tactics.mjs";
import { Game } from "../game.mjs";
test("smoke blocks the whole sight segment, including either endpoint", () => {
  const a = { x: -18, z: 0, yaw: 0 },
    b = { x: -18, z: -20 };
  assert.equal(smokeBlocks(a, b, [{ x: -18, z: -2 }]), true);
  assert.equal(smokeBlocks(a, b, [{ x: -18, z: -18 }]), true);
  assert.equal(smokeBlocks(a, b, [{ x: -5, z: -10 }]), false);
  assert.equal(seesEnemy(a, b, [{ x: -18, z: -2 }]), false);
  assert.equal(seesEnemy(a, b, []), true);
  assert.equal(seesEnemy({ ...a, yaw: Math.PI }, b, []), false);
});
function squad() {
  const g = new Game("TACTICS");
  for (let i = 0; i < 10; i++)
    g.add("p" + i, "P" + i, ["veil", "pulse", "dash"][i % 3], true);
  g.owner = "p0";
  g.start("p0");
  return g;
}
test("carrier alternates sites; escorts and flank split duties", () => {
  const g = squad(),
    p = g.players.get(g.spike.carrier);
  assert.equal(botObjective(g, p).target.name, "A");
  const roles = [...g.players.values()]
    .filter((q) => q.team === 0)
    .map((q) => botObjective(g, q).role);
  assert.equal(roles.filter((r) => r === "plant").length, 1);
  assert.ok(roles.includes("flank"));
  assert.ok(roles.includes("escort"));
  g.nextRound();
  assert.equal(botObjective(g, p).target.name, "B");
  g.spike.carrier = null;
  assert.equal(botObjective(g, p).role, "recover");
});
test("one defender defuses while others cover; active human takes priority", () => {
  const g = squad();
  g.spike = { planted: true, x: -19, z: -16, carrier: null };
  const defense = [...g.players.values()].filter((q) => q.team === 1);
  assert.equal(defense.filter((q) => botObjective(g, q).use).length, 1);
  const chosen = defense.find((q) => botObjective(g, q).use);
  chosen.alive = false;
  assert.equal(
    defense.filter((q) => q.alive && botObjective(g, q).use).length,
    1,
  );
  const human = defense.find((q) => q.alive);
  Object.assign(human, { bot: false, x: -19, z: -16, progress: 1 });
  assert.equal(
    defense.filter((q) => q.alive && q.bot && botObjective(g, q).use).length,
    0,
  );
});
test("bots buy utility and use visible-target abilities after reaction delay, not through smoke", () => {
  const g = new Game("TACTICS");
  const p = g.add("a", "A", "pulse", true),
    q = g.add("b", "B");
  g.owner = p.id;
  g.start(p.id);
  g.botThink(p);
  assert.ok(p.secondary > 0);
  Object.assign(p, { x: -18, z: 0, yaw: 0 });
  Object.assign(q, { x: -18, z: -5 });
  g.phase = "live";
  g.botThink(p);
  assert.equal(q.hp, 100);
  g.time += 0.4;
  g.botThink(p);
  assert.equal(q.hp, 55);
  const charges = p.secondary;
  g.botThink(p);
  assert.equal(p.secondary, charges);
  g.smokes = [{ x: -18, z: -2, end: 100 }];
  g.time += 2;
  g.botThink(p);
  assert.equal(p.botTarget, null);
  assert.equal(q.hp, 55);
});
