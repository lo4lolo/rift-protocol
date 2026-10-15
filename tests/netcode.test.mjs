import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import {
  simulateCommand,
  motionState,
  reconcile,
  SnapshotBuffer,
  interpolatePose,
  MAX_REWIND,
} from "../netcode.mjs";
function setup() {
  const g = new Game("NET", { random: () => 0.5 });
  const p = g.add("a", "A");
  g.add("b", "B");
  g.start("a");
  g.phase = "live";
  g.end = 100;
  p.x = -18;
  p.z = 24;
  return { g, p };
}

test("200ms round-trip with ordered jitter preserves predicted movement and converges", () => {
  const { g, p } = setup();
  let predicted = motionState(p),
    reference = motionState(p),
    pending = [],
    seq = 0,
    previousArrival = 0,
    maxError = 0;
  const outbound = [],
    inbound = [];
  for (let tick = 0; tick < 720; tick++) {
    if (tick < 480 && tick % 2 === 0) {
      const quadrant = Math.floor(tick / 120) % 4;
      const c = {
        seq: ++seq,
        round: g.round,
        yaw: (quadrant * Math.PI) / 2,
        pitch: 0,
        w: true,
        jump: tick === 40,
      };
      simulateCommand(predicted, c);
      simulateCommand(reference, c);
      pending.push(c);
      const due = Math.max(
        previousArrival,
        tick + 6 + (tick % 14 === 0 ? 3 : 0),
      );
      previousArrival = due;
      outbound.push({ due, c });
    }
    while (outbound[0]?.due <= tick) g.input("a", outbound.shift().c);
    g.tick(1 / 60);
    if (tick % 3 === 0)
      inbound.push({
        due: tick + 6,
        state: g.snapshot().players.find((p) => p.id === "a"),
      });
    while (inbound[0]?.due <= tick) {
      const result = reconcile(inbound.shift().state, pending);
      predicted = result.predicted;
      pending = result.pending;
    }
    maxError = Math.max(
      maxError,
      Math.hypot(predicted.x - reference.x, predicted.z - reference.z),
    );
  }
  assert.ok(maxError < 0.025, `prediction error ${maxError}`);
  assert.equal(pending.length, 0);
  assert.equal(p.ack, seq);
  assert.ok(Math.hypot(predicted.x - p.x, predicted.z - p.z) < 0.002);
});

test("input flooding cannot simulate more movement than elapsed server time", () => {
  const { g, p } = setup();
  const start = { x: p.x, z: p.z };
  let seq = 0;
  for (let tick = 0; tick < 60; tick++) {
    for (let i = 0; i < 50; i++)
      g.input("a", { seq: ++seq, round: g.round, yaw: 0, pitch: 0, w: true });
    g.tick(1 / 60);
    assert.ok(p.commands.length <= 12);
  }
  assert.ok(Math.hypot(p.x - start.x, p.z - start.z) <= 5.61);
  assert.ok(p.ack < seq);
});

test("round transition rejects old commands and clears old history", () => {
  const { g, p } = setup();
  g.recordHistory();
  g.input("a", { seq: 1, round: g.round, yaw: 0, pitch: 0, w: true });
  const old = g.round;
  g.nextRound();
  g.input("a", { seq: 2, round: old, yaw: 0, pitch: 0, w: true });
  assert.equal(p.commands.length, 0);
  assert.equal(p.history.length, 0);
});

test("server rewinds a moving target to the rendered pose", () => {
  const { g, p } = setup(),
    b = g.players.get("b");
  p.x = -18;
  p.z = 0;
  p.yaw = 0;
  p.pitch = 0;
  b.x = -18;
  b.z = -5;
  g.time = 1;
  g.recordHistory();
  g.time = 1.1;
  b.x = -17;
  g.recordHistory();
  g.time = 1.2;
  b.x = -16;
  g.recordHistory();
  p.input = { viewTime: 1 };
  g.shoot(p);
  assert.ok(b.hp < 100, "the target visible at x=-18 should be hit");
  b.hp = 100;
  g.time = 2;
  p.input = { viewTime: 2 };
  g.shoot(p);
  assert.equal(b.hp, 100, "current position should miss the same ray");
});

test("rewind time is bounded and cannot hit a player before their spawn", () => {
  const { g, p } = setup(),
    b = g.players.get("b");
  p.x = -18;
  p.z = 0;
  p.yaw = 0;
  b.x = -18;
  b.z = -5;
  g.time = 1;
  g.recordHistory();
  g.time = 2;
  b.x = -16;
  g.recordHistory();
  const pose = g.historicalPose(b, -1000);
  assert.ok(pose.x > -18);
  g.input("a", { seq: 1, round: g.round, yaw: 0, pitch: 0, viewTime: -1000 });
  assert.equal(p.commands[0].viewTime, g.time - MAX_REWIND);
  g.nextRound();
  g.phase = "live";
  p.x = -18;
  p.z = 0;
  p.yaw = 0;
  b.x = -16;
  b.z = -5;
  p.input = { viewTime: 1 };
  g.shoot(p);
  assert.equal(b.hp, 100);
});

test("interpolation follows timestamped snapshots and crosses yaw wrap correctly", () => {
  const buffer = new SnapshotBuffer();
  buffer.push({
    round: 1,
    time: 1,
    players: [
      { id: "p", alive: true, x: 0, y: 0, z: 0, yaw: Math.PI - 0.1, pitch: 0 },
    ],
  });
  buffer.push({
    round: 1,
    time: 1.1,
    players: [
      { id: "p", alive: true, x: 1, y: 0, z: 0, yaw: -Math.PI + 0.1, pitch: 0 },
    ],
  });
  const p = buffer.pose("p", 1.05);
  assert.ok(Math.abs(p.x - 0.5) < 1e-8);
  assert.ok(Math.abs(p.yaw - Math.PI) < 1e-8);
  buffer.push({ round: 2, time: 2, players: [] });
  assert.equal(buffer.samples.length, 1);
});
test("an airborne client cannot float indefinitely by stopping input", () => {
  const { g, p } = setup();
  g.input("a", { seq: 1, round: g.round, yaw: 0, pitch: 0, jump: true });
  for (let i = 0; i < 10; i++) g.tick(1 / 60);
  assert.ok(p.y > 0);
  for (let i = 0; i < 90; i++) g.tick(1 / 60);
  assert.equal(p.y, 0);
});
test("remote yaw crossing positive and negative full rotations uses the short arc", () => {
  const pose = { x: 0, y: 0, z: 0, pitch: 0, alive: true };
  const p = interpolatePose({ ...pose, yaw: 6.2 }, { ...pose, yaw: -6.2 }, 0.5);
  assert.ok(Math.abs(p.yaw - Math.PI * 2) < 1e-8);
});
