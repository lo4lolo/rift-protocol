import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { MAP } from "../shared.mjs";
import { motionState, simulateCommand, reconcile } from "../netcode.mjs";
test("both teams move during purchase but cannot cross or jump over the start line", () => {
  const g = new Game("PREP", { buy: 100 });
  g.add("a", "A");
  g.add("b", "B");
  g.start("a");
  for (const p of g.players.values()) {
    p.x = -18;
    p.z = p.team === 0 ? 20 : -20;
    const start = p.z;
    for (let i = 1; i <= 90; i++) {
      g.input(p.id, {
        seq: i,
        round: g.round,
        yaw: p.team === 0 ? 0 : Math.PI,
        pitch: 0,
        w: true,
        jump: true,
        phase: "live",
        fire: true,
      });
      g.tick(1 / 30);
    }
    assert.notEqual(p.z, start);
    assert.ok(Math.abs(p.z) >= MAP.buyLine + 0.38 - 1e-8);
    assert.equal(p.ammo, 12);
    assert.equal(g.ability(p.id), false);
  }
});
test("buy-phase prediction and replay agree with authoritative barrier and release in live phase", () => {
  const p = {
    x: -18,
    z: 19,
    y: 0,
    vy: 0,
    yaw: 0,
    pitch: 0,
    team: 0,
    alive: true,
    ack: 0,
  };
  const pending = Array.from({ length: 20 }, (_, i) => ({
    seq: i + 1,
    yaw: 0,
    pitch: 0,
    w: true,
  }));
  const predicted = motionState(p);
  for (const cmd of pending) simulateCommand(predicted, cmd, "buy");
  const replay = reconcile(p, pending, "buy").predicted;
  assert.equal(predicted.z, replay.z);
  assert.equal(predicted.z, 18.38);
  for (const cmd of pending) simulateCommand(predicted, cmd, "live");
  assert.ok(predicted.z < 18);
});
test("airborne preparation player lands after input stops", () => {
  const g = new Game("PREP", { buy: 100 });
  const p = g.add("a", "A");
  g.start("a");
  g.input("a", { seq: 1, round: g.round, yaw: 0, pitch: 0, jump: true });
  g.tick(1 / 30);
  assert.ok(p.y > 0);
  for (let i = 0; i < 120; i++) g.tick(1 / 60);
  assert.equal(p.y, 0);
});
