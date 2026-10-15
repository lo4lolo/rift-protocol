import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { hasSight } from "../visibility.mjs";
import { SnapshotBuffer, interpolatePose } from "../netcode.mjs";
function setup() {
  const g = new Game("SIGHT");
  const a = g.add("a", "A"),
    b = g.add("b", "B");
  Object.assign(a, { x: -18, z: 10 });
  Object.assign(b, { x: -18, z: 0 });
  return {
    g,
    a,
    b,
    enemy: () => g.snapshot("a").players.find((p) => p.id === "b"),
  };
}

test("reload animation is visible without inventory timers and disappears behind cover", () => {
  const { g, b, enemy } = setup();
  Object.assign(b, { z: 7, weapon: "rifle", reloadUntil: 2, equipUntil: 0 });
  g.time = 1;
  const visible = enemy();
  assert.equal(visible.visible, true);
  assert.ok(visible.reloadProgress > 0 && visible.reloadProgress < 1);
  for (const key of ["reloadUntil", "equipUntil", "ammo", "reserve"])
    assert.ok(!(key in visible));
  b.z = 0;
  assert.ok(!("reloadProgress" in enemy()));
  b.z = 7;
  b.reloadUntil = 0;
  assert.equal(enemy().reloadProgress, null);
});
test("wall and smoke hide coordinates; reveal expires; alive connected unblinded allies share sight", () => {
  const { g, a, b, enemy } = setup();
  assert.equal(hasSight(a, b), false);
  assert.equal(enemy().visible, false);
  for (const key of ["x", "y", "z", "yaw", "pitch", "weapon"])
    assert.ok(!(key in enemy()));
  b.revealUntil = 2;
  assert.equal(enemy().visible, true);
  g.time = 2;
  assert.equal(enemy().visible, false);
  const c = g.add("c", "C");
  Object.assign(c, { x: -18, z: -1 });
  assert.equal(enemy().visible, true);
  c.blindUntil = 5;
  assert.equal(enemy().visible, false);
  c.blindUntil = 0;
  c.connected = false;
  assert.equal(enemy().visible, false);
  c.connected = true;
  c.alive = false;
  assert.equal(enemy().visible, false);
  b.z = 7;
  assert.equal(enemy().visible, true);
  g.smokes = [{ x: -18, z: 8.5 }];
  assert.equal(enemy().visible, false);
  assert.equal(g.snapshot().players.find((p) => p.id === "b").x, -18);
});
test("hidden muzzle and ability events become bounded non-positional audio or are omitted", () => {
  const { g, b } = setup();
  g.event("shot", {
    player: b.id,
    from: [-18, 1.6, 0],
    to: [-18, 1.6, 10],
    hit: false,
  });
  g.event("skill", { player: b.id, x: b.x, z: b.z, agent: b.agent });
  const events = g.snapshot("a").events;
  assert.deepEqual(
    events.map((e) => e.type),
    ["sound"],
  );
  assert.deepEqual(Object.keys(events[0]).sort(), [
    "id",
    "kind",
    "level",
    "pan",
    "time",
    "type",
  ]);
  assert.equal(g.snapshot("b").events.length, 2);
  assert.equal(g.events[0].type, "shot");
});
test("unseen attacking carrier and dropped items cannot expose hidden positions to defenders", () => {
  const { g, a, b } = setup();
  g.spike = { planted: false, carrier: a.id, x: a.x, z: a.z };
  g.drops = [{ id: "loot", weapon: "rifle", x: a.x, z: a.z }];
  assert.deepEqual(g.snapshot("b").spike, {
    planted: false,
    hidden: true,
    carrier: null,
  });
  assert.equal(g.snapshot("b").drops.length, 0);
  assert.equal(g.snapshot("a").spike.carrier, a.id);
  g.spike.planted = true;
  assert.equal(g.snapshot("b").spike.x, a.x);
  g.spike.planted = false;
  g.spike.carrier = null;
  assert.equal(g.snapshot("b").spike.hidden, true);
  b.z = 7;
  assert.equal(g.snapshot("b").spike.hidden, undefined);
  assert.equal(g.snapshot("b").drops.length, 1);
});
test("interpolation never resurrects a newly hidden enemy or interpolates absent coordinates", () => {
  const visible = {
    id: "b",
    visible: true,
    x: 2,
    y: 0,
    z: 2,
    yaw: 0,
    pitch: 0,
    alive: true,
  };
  const hidden = { id: "b", visible: false, alive: true };
  assert.equal(interpolatePose(visible, hidden, 0.1), hidden);
  assert.equal(interpolatePose(hidden, visible, 0.1), visible);
  const buffer = new SnapshotBuffer();
  buffer.push({ round: 1, time: 1, players: [visible] });
  buffer.push({ round: 1, time: 2, players: [hidden] });
  assert.equal(buffer.pose("b", 1).visible, false);
});
