import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("HALF", { defuse: 1 });
  for (const id of ["a", "b", "c", "d"]) g.add(id, id);
  g.start("a");
  g.phase = "live";
  g.end = 100;
  Object.assign(g.spike, { planted: true, carrier: null, x: -18, z: -16 });
  const b = g.players.get("b"),
    d = g.players.get("d");
  for (const p of [b, d]) Object.assign(p, { x: -18, z: -16, lastInput: 100 });
  const advance = (n) => {
    for (let i = 0; i < n; i++) g.tick(1 / 60);
  };
  return { g, b, d, advance };
}
test("half checkpoint persists across interruption and a different defender finishes the remainder", () => {
  const { g, b, d, advance } = setup();
  b.input = { use: true };
  advance(24);
  b.input = {};
  advance(1);
  assert.equal(b.progress, 0);
  assert.equal(g.spike.defuseCheckpoint, 0);
  b.input = { use: true };
  advance(34);
  assert.equal(g.spike.defuseCheckpoint, 0.5);
  b.input = {};
  advance(1);
  d.input = { use: true };
  advance(25);
  assert.equal(g.phase, "live");
  assert.ok(d.progress > 0.9);
  advance(6);
  assert.equal(g.winner, 1);
  assert.equal(g.phase, "end");
  assert.equal(d.ultimate, 1);
  assert.equal(b.ultimate, 0);
  g.nextRound();
  assert.equal(g.spike.defuseCheckpoint, 0);
});
test("simultaneous defenders cannot accelerate a defuse and disconnect transfers the interaction", () => {
  const { g, b, d, advance } = setup();
  b.input = d.input = { use: true };
  advance(25);
  assert.equal(g.spike.defuseCheckpoint, 0);
  assert.equal(d.progress, 0);
  advance(10);
  assert.equal(g.spike.defuseCheckpoint, 0.5);
  b.connected = false;
  b.input = {};
  advance(1);
  assert.equal(g.spike.defuser, d.id);
  assert.ok(d.progress > 0.5 && d.progress < 0.55);
  const own = g.snapshot("d").spike,
    enemy = g.snapshot("a").spike;
  assert.equal(own.defuseCheckpoint, 0.5);
  assert.ok(!("defuser" in own));
  assert.ok(!("defuseCheckpoint" in enemy));
});
test("moving, jumping and firing interrupt defuse; a late finish cannot beat detonation", () => {
  const { g, b, advance } = setup();
  for (const input of [
    { use: true, w: true },
    { use: true, fire: true },
  ]) {
    b.input = input;
    advance(2);
    assert.equal(b.progress, 0);
  }
  b.y = 0.2;
  b.vy = 0;
  b.input = { use: true };
  advance(1);
  assert.equal(b.progress, 0);
  b.y = 0;
  b.progress = 0.99;
  g.end = g.time + 0.001;
  advance(1);
  assert.equal(g.winner, 0);
  assert.equal(g.phase, "end");
});
