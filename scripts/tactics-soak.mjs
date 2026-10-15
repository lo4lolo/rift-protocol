import { Game } from "../game.mjs";
import { MAP } from "../shared.mjs";
import { reportDate } from "./report-time.mjs";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const runs = [];
for (const seed of [17, 45, 2026]) {
  let rng = seed;
  const random = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const g = new Game("TACTICS", {
    buy: 0.3,
    round: 70,
    fuse: 25,
    plant: 2,
    defuse: 3,
    random,
  });
  for (let i = 0; i < 10; i++)
    g.add("b" + i, "Bot" + i, ["veil", "pulse", "dash", "haven"][i % 4], true);
  g.owner = "b0";
  g.start("b0");
  let seen = 0;
  const abilities = {},
    sites = { A: 0, B: 0 },
    roles = new Set();
  let defuses = 0;
  const collectedOrbs = new Set();
  for (let i = 0; i < 60 * 2400 && g.phase !== "match"; i++) {
    g.tick(1 / 60);
    for (const orb of g.orbs)
      if (!orb.available) collectedOrbs.add(`${g.round}:${orb.id}`);
    for (const p of g.players.values()) {
      assert.ok(
        Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
      );
      assert.ok(p.credits >= 0 && p.secondary >= 0 && p.secondary <= 2);
      if (p.botRole) roles.add(p.botRole);
    }
    for (const e of g.events) {
      if (e.id <= seen) continue;
      seen = e.id;
      if (e.type === "skill") {
        const key = e.agent + ":" + e.slot;
        abilities[key] = (abilities[key] || 0) + 1;
      }
      if (e.type === "plant") {
        const site = MAP.sites.reduce((a, b) =>
          Math.hypot(a.x - g.spike.x, a.z - g.spike.z) <
          Math.hypot(b.x - g.spike.x, b.z - g.spike.z)
            ? a
            : b,
        );
        sites[site.name]++;
      }
      if (e.type === "result" && e.reason === "코어 해체") defuses++;
    }
  }
  assert.equal(g.phase, "match");
  assert.ok(Object.values(abilities).reduce((a, b) => a + b, 0) > 5);
  assert.ok(sites.A > 0 && sites.B > 0);
  assert.ok(roles.has("escort") && roles.has("flank") && roles.has("cover"));
  runs.push({
    seed,
    rounds: g.round,
    score: g.score,
    simulationSeconds: g.time,
    abilities,
    sites,
    defuses,
    collectedOrbs: collectedOrbs.size,
    roles: [...roles],
  });
}
const report = {
  date: reportDate(),
  runs,
  note: "Three deterministic accelerated 10-bot matches; not real-time user or network load",
};
await writeFile("evidence/tactics-soak.json", JSON.stringify(report, null, 2));
console.log(report);
