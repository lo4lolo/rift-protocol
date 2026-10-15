import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
test("waiting late joiner cannot trigger elimination, receive round rewards or act", () => {
  const g = new Game("LATE");
  const a = g.add("a", "A");
  g.start(a.id);
  g.phase = "live";
  g.end = 100;
  const b = g.add("b", "B");
  assert.equal(b.alive, false);
  assert.equal(b.awaitingSpawn, true);
  g.tick(1 / 60);
  assert.equal(g.phase, "live");
  assert.deepEqual(g.score, [0, 0]);
  const ammo = b.ammo;
  g.shoot(b);
  assert.equal(b.ammo, ammo);
  assert.equal(g.ability(b.id), false);
  const credits = b.credits;
  g.finish(0, "test");
  assert.equal(b.credits, credits);
  assert.equal(b.deaths, 0);
  assert.equal(
    g.snapshot(b.id).players.find((p) => p.id === b.id).awaitingSpawn,
    true,
  );
  g.nextRound();
  assert.equal(b.alive, true);
  assert.equal(b.awaitingSpawn, false);
  assert.equal(b.credits, credits);
});
test("a dead participant still counts for elimination while a new waiting teammate does not revive the team", () => {
  const g = new Game("LATE2");
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start(a.id);
  g.phase = "live";
  g.end = 100;
  g.add("c", "C");
  const d = g.add("d", "D");
  b.alive = false;
  g.tick(1 / 60);
  assert.equal(g.winner, 0);
  assert.equal(g.phase, "end");
  assert.equal(d.awaitingSpawn, true);
  assert.equal(d.credits, 800);
  assert.equal(b.awaitingSpawn, false);
  assert.equal(b.credits, 2700);
});
