import test from "node:test";
import assert from "node:assert/strict";
import { findPath } from "../navigation.mjs";
import { MAP, blocked } from "../shared.mjs";
import { Game } from "../game.mjs";
test("both spawns reach both sites without crossing colliders", () => {
  for (const z of [-26, 26])
    for (const target of MAP.sites) {
      const path = findPath({ x: 0, z }, target);
      assert.ok(path.length > 0);
      for (const p of path) assert.equal(blocked(p.x, p.z, 0.7), false);
      for (let i = 1; i < path.length; i++)
        assert.equal(
          blocked(
            (path[i].x + path[i - 1].x) / 2,
            (path[i].z + path[i - 1].z) / 2,
            0.7,
          ),
          false,
        );
      assert.ok(
        Math.hypot(path.at(-1).x - target.x, path.at(-1).z - target.z) < 3,
      );
    }
});
test("bot carrier navigates from spawn and plants without human input", () => {
  const g = new Game("BOTS", { buy: 0.01, round: 90 });
  const p = g.add("bot", "Bot", "veil", true);
  g.owner = p.id;
  g.start(p.id);
  for (let i = 0; i < 60 * 80 && !g.spike.planted; i++) g.tick(1 / 60);
  assert.equal(g.spike.planted, true);
  assert.equal(g.phase, "live");
});
