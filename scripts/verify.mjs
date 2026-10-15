import { reportDate } from "./report-time.mjs";
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
const stages = [
  [
    "rules-and-network",
    [
      "--test",
      ...readdirSync("tests")
        .filter((n) => n.endsWith(".test.mjs"))
        .map((n) => "tests/" + n),
    ],
  ],
  ["bots", ["scripts/soak.mjs"]],
  ["bot-tactics", ["scripts/tactics-soak.mjs"]],
  ["ten-clients", ["scripts/network-load.mjs"]],
  ["volley-load", ["scripts/volley-load.mjs"]],
  ["reconnect-load", ["scripts/reconnect-load.mjs"]],
  ["delayed-network", ["scripts/delayed-network.mjs"]],
  ["browser", ["scripts/browser-check.mjs"]],
  ["browser-delayed", ["scripts/browser-check.mjs"], { NET_DELAY_MS: "100" }],
  ["combat-delayed", ["scripts/combat-check.mjs"]],
  ["abilities-delayed", ["scripts/abilities-check.mjs"]],
  ["match-flow", ["scripts/match-flow-check.mjs"]],
  ["preparation-delayed", ["scripts/preparation-check.mjs"]],
  ["visual", ["scripts/visual-check.mjs"]],
];
mkdirSync("evidence", { recursive: true });
const report = [];
for (const [name, args, extraEnv] of stages) {
  if (
    ![
      "rules-and-network",
      "bots",
      "bot-tactics",
      "ten-clients",
      "volley-load",
      "reconnect-load",
      "delayed-network",
    ].includes(name) &&
    process.env.RUN_BROWSER_TESTS !== "1"
  ) {
    report.push({
      stage: name,
      passed: null,
      skipped: true,
      reason:
        "Desktop mouse interference: browser control disabled by user preference",
    });
    continue;
  }
  const start = Date.now();
  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: { ...process.env, NET_DELAY_MS: "0", ...extraEnv },
  });
  const output = (r.stdout || "") + (r.stderr || "");
  writeFileSync(`evidence/${name}.log`, output);
  process.stdout.write(output);
  report.push({
    stage: name,
    passed: r.status === 0,
    elapsedMs: Date.now() - start,
  });
  if (r.status !== 0) {
    writeFileSync(
      "evidence/verification.json",
      JSON.stringify({ date: reportDate(), report }, null, 2),
    );
    process.exit(r.status || 1);
  }
}
writeFileSync(
  "evidence/verification.json",
  JSON.stringify({ date: reportDate(), report }, null, 2),
);
console.log(
  "Selected verification stages passed. Browser stages remain disabled unless explicitly authorized.",
);
