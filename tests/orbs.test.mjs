import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { AGENTS } from "../shared.mjs";
function setup() {
  const g = new Game("ORB"),
    a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start(a.id);
  g.phase = "live";
  g.end = 100;
  for (const p of [a, b])
    Object.assign(p, { x: -18, z: 8, input: { use: true } });
  return { g, a, b };
}
test("orb channels for three seconds and grants one point once under contention", () => {
  const { g, a, b } = setup();
  for (let i = 0; i < 179; i++) {
    g.collectOrb(a, 1 / 60);
    g.collectOrb(b, 1 / 60);
  }
  assert.equal(a.ultimate, 0);
  assert.equal(b.ultimate, 0);
  g.collectOrb(a, 1 / 60);
  g.collectOrb(b, 1 / 60);
  assert.equal(a.ultimate, 1);
  assert.equal(b.ultimate, 0);
  assert.equal(g.orbs[0].available, false);
  g.collectOrb(a, 5);
  assert.equal(a.ultimate, 1);
  g.nextRound();
  assert.equal(g.orbs[0].available, true);
});
test("movement, attacks, damage, busy state, cap and phase cannot bank partial collection", () => {
  for (const mode of [
    "w",
    "fire",
    "altPressed",
    "damage",
    "busy",
    "dead",
    "air",
    "disconnect",
    "buy",
    "planted",
    "cap",
  ]) {
    const { g, a, b } = setup();
    g.collectOrb(a, 2);
    if (["w", "fire", "altPressed"].includes(mode)) a.input[mode] = true;
    if (mode === "damage") g.damage(a, 1, b);
    if (mode === "dead") a.alive = false;
    if (mode === "air") a.y = 0.1;
    if (mode === "disconnect") a.connected = false;
    if (mode === "buy") g.phase = "buy";
    if (mode === "planted") g.spike.planted = true;
    if (mode === "cap") a.ultimate = AGENTS[a.agent].ultimate.points;
    if (mode !== "damage") g.collectOrb(a, 0.5, mode === "busy");
    assert.equal(a.orbProgress, 0, mode);
    assert.equal(g.orbs[0].available, true, mode);
  }
});
test("orb state behind walls and collector progress stay private", () => {
  const { g, a, b } = setup();
  g.collectOrb(a, 1);
  Object.assign(b, { x: -18, z: 0 });
  const own = g.snapshot(a.id),
    opponent = g.snapshot(b.id);
  assert.equal(own.players.find((p) => p.id === a.id).orbProgress, 1);
  assert.ok(!("orbProgress" in opponent.players.find((p) => p.id === a.id)));
  assert.equal(
    opponent.orbs.some((o) => o.id === "west"),
    false,
  );
  a.x = 0;
  a.z = -2;
  g.orbs = [{ id: "wall", x: 0, z: -7, available: true }];
  g.collectOrb(a, 3);
  assert.equal(a.ultimate, 0);
});
test("real tick integrates held use and cancels after stale input", () => {
  const { g, a, b } = setup();
  b.input = {};
  b.z = -20;
  for (let i = 0; i < 180; i++) {
    a.lastInput = g.time;
    a.input = { use: true };
    g.tick(1 / 60);
  }
  assert.equal(a.ultimate, 1);
  assert.equal(g.orbs[0].available, false);
  g.nextRound();
  g.phase = "live";
  Object.assign(a, { x: -18, z: 8 });
  a.input = { use: true };
  a.lastInput = g.time;
  for (let i = 0; i < 60; i++) g.tick(1 / 60);
  assert.equal(a.orbProgress, 0);
  assert.equal(g.orbs[0].available, true);
});
