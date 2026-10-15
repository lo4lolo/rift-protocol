import test from "node:test";
import assert from "node:assert/strict";
import { WEAPONS, move, movementSpeed } from "../shared.mjs";
import { motionState, simulateCommand, reconcile } from "../netcode.mjs";
import { Game } from "../game.mjs";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("weapon, stance, aim and tagging combine consistently without diagonal acceleration", () => {
  for (const weapon of Object.keys(WEAPONS)) {
    for (const input of [
      { w: true },
      { w: true, d: true },
      { w: true, walk: true },
      { w: true, crouch: true, walk: true },
      { w: true, ads: true },
    ]) {
      const p = { x: -18, z: 10, yaw: 0, weapon };
      const speed = movementSpeed(p, input);
      move(p, input, 0.1);
      near(Math.hypot(p.x + 18, p.z - 10), speed * 0.1);
      near(movementSpeed({ ...p, slow: 0.3 }, input), speed * 0.5);
    }
  }
  assert.ok(
    movementSpeed({ weapon: "knife" }, {}) >
      movementSpeed({ weapon: "pistol" }, {}),
  );
  near(movementSpeed({ weapon: "pistol" }, { ads: true }), 5.6);
  near(movementSpeed({ weapon: "pistol" }, { walk: true, crouch: true }), 2);
});
test("authoritative equipment drives replay; command weapon fields cannot increase speed", () => {
  const p = {
    x: -18,
    z: 10,
    y: 0,
    vy: 0,
    yaw: 0,
    pitch: 0,
    weapon: "sniper",
    alive: true,
    ack: 0,
  };
  const input = {
    seq: 1,
    w: true,
    ads: true,
    yaw: 0,
    pitch: 0,
    weapon: "knife",
    moveSpeed: 999,
  };
  const local = motionState(p);
  simulateCommand(local, input);
  const replay = reconcile(p, [input]).predicted;
  near(local.z, replay.z);
  near(
    10 - local.z,
    (WEAPONS.sniper.moveSpeed * WEAPONS.sniper.aimMoveScale) / 30,
  );
  const g = new Game("SPEED");
  const a = g.add("a", "A");
  g.start(a.id);
  g.phase = "live";
  Object.assign(a, p);
  g.input(a.id, { ...input, round: g.round });
  g.consumeCommand(a, 1 / 30);
  near(a.z, local.z);
  assert.equal(a.weapon, "sniper");
});
test("movement ability distance remains independent of equipped weapon", () => {
  const distances = [];
  for (const weapon of ["knife", "sniper"]) {
    const g = new Game("DASH");
    const a = g.add("a", "A", "dash");
    g.start(a.id);
    g.phase = "live";
    Object.assign(a, { x: -18, z: 0, yaw: 0, weapon });
    g.ability(a.id);
    distances.push(-a.z);
  }
  near(distances[0], distances[1]);
  near(distances[0], 5.6 * 0.08 * 16);
});
