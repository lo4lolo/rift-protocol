import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { soundCue, movementSound } from "../hearing.mjs";
test("sound uses listener-relative stereo and range tiers without exact source position", () => {
  const listener = { alive: true, connected: true, x: 0, z: 0, yaw: 0 };
  const e = { id: 1, time: 0, player: "secret", x: 5, z: 0 };
  assert.equal(soundCue(listener, e, e, "step", 20).pan, 1);
  listener.yaw = Math.PI;
  assert.equal(soundCue(listener, e, e, "step", 20).pan, -1);
  const cue = soundCue(listener, e, e, "step", 20);
  for (const key of ["x", "z", "player"]) assert.ok(!(key in cue));
  assert.equal(soundCue(listener, e, { x: 20, z: 0 }, "step", 20), null);
  listener.alive = false;
  assert.equal(soundCue(listener, e, e, "step", 20), null);
});
test("walking, crouching, air and teleports are quiet; landing is a separate sound", () => {
  const p = { x: 1.8, z: 0, y: 0, alive: true, connected: true, input: {} };
  const before = { x: 0, z: 0, y: 0 };
  assert.equal(movementSound(p, before, "live"), "step");
  for (const mode of ["walk", "crouch"]) {
    p.input = { [mode]: true };
    assert.equal(movementSound(p, before, "live"), null);
  }
  p.input = {};
  p.y = 1;
  assert.equal(movementSound(p, before, "live"), null);
  p.y = 0;
  assert.equal(movementSound(p, { ...before, y: 0.1 }, "live"), "land");
  p.x = 10;
  assert.equal(movementSound(p, before, "live"), null);
});
test("real movement emits steps, wall pushing does not; snapshots only send nearby sound cues", () => {
  const g = new Game("HEAR", { buy: 100 });
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  g.start("a");
  g.phase = "live";
  g.end = 100;
  Object.assign(a, { x: -18, z: 10 });
  Object.assign(b, { x: -18, z: 0 });
  for (let i = 1; i <= 60; i++) {
    g.input("a", { seq: i, round: g.round, yaw: 0, pitch: 0, w: true });
    g.tick(1 / 30);
  }
  const steps = g.events.filter((e) => e.type === "footstep");
  assert.ok(steps.length >= 1);
  const lastId = g.eventId;
  for (let i = 61; i <= 100; i++) {
    g.input("a", { seq: i, round: g.round, yaw: 0, pitch: 0, w: true });
    g.tick(1 / 30);
  }
  assert.equal(g.eventId, lastId);
  const heard = g.snapshot("b").events.filter((e) => e.kind === "step");
  assert.ok(heard.length);
  assert.ok(
    heard.every((e) => e.type === "sound" && !("x" in e) && !("player" in e)),
  );
  b.x = 28;
  b.z = -28;
  assert.equal(
    g.snapshot("b").events.filter((e) => e.kind === "step").length,
    0,
  );
});
