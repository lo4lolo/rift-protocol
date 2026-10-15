import { reportDate } from "./report-time.mjs";
import { Game } from "../game.mjs";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const started = performance.now(),
  g = new Game("SOAK", { buy: 0.2, round: 70, fuse: 15, plant: 2, defuse: 3 });
for (let i = 0; i < 10; i++)
  g.add(`bot${i}`, `Bot${i}`, ["veil", "pulse", "dash"][i % 3], true);
g.owner = "bot0";
g.start("bot0");
let shots = 0,
  kills = 0,
  plants = 0,
  seen = 0;
for (let i = 0; i < 60 * 1800 && g.phase !== "match"; i++) {
  g.tick(1 / 60);
  for (const e of g.events) {
    if (e.id <= seen) continue;
    seen = e.id;
    if (e.type === "shot") shots++;
    if (e.type === "kill") kills++;
    if (e.type === "plant") plants++;
  }
  for (const p of g.players.values())
    assert.ok(
      Number.isFinite(p.x) &&
        Number.isFinite(p.z) &&
        p.ammo >= 0 &&
        p.credits >= 0 &&
        p.credits <= 9000,
    );
}
const result = {
  date: reportDate(),
  phase: g.phase,
  round: g.round,
  score: g.score,
  shots,
  kills,
  plants,
  simulationSeconds: g.time,
  executionMs: Math.round(performance.now() - started),
};
assert.equal(g.phase, "match");
assert.ok(shots > 0 && kills > 0);
await writeFile("evidence/soak-results.json", JSON.stringify(result, null, 2));
console.log(result);
