import "./browser-consent.mjs";
import { reportDate } from "./report-time.mjs";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "../server.mjs";
import { createLatencyProxy } from "./latency-proxy.mjs";
const app = createServer({ port: 0, host: "127.0.0.1" }),
  { port } = await app.listen();
const proxy = await createLatencyProxy(port, { delayMs: 100, jitterMs: 20 });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const errors = [],
  results = [],
  folder = "evidence/preparation";
await mkdir(folder, { recursive: true });
async function until(fn) {
  for (let i = 0; i < 80 && !fn(); i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(fn(), "condition timed out");
}
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${proxy.port}`);
  await page.locator("#name").fill("Observer");
  await page.locator("#code").fill("PREP");
  await page.locator("#join").click();
  await page.locator("#lobby").waitFor({ state: "visible" });
  const game = app.rooms.get("PREP"),
    self = [...game.players.values()][0];
  const enemy = game.add("enemy", "Enemy"),
    ally1 = game.add("ally1", "Ally One"),
    ally2 = game.add("ally2", "Ally Two");
  game.chooseTeam(ally2.id, 0);
  await page.locator("#start").click();
  await page.locator("#hud").waitFor({ state: "visible" });
  game.end = game.time + 30;
  self.x = -18;
  self.z = 20;
  await page.waitForTimeout(500);
  await page.locator("#resume").click();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1400);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(300);
  assert.ok(Math.abs(self.z - 18.38) < 0.01);
  await page.screenshot({ path: `${folder}/01-start-barrier.png` });
  game.end = game.time + 0.05;
  await page.waitForFunction(
    () => document.querySelector("#phase").textContent === "작전 진행",
  );
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(450);
  await page.keyboard.up("KeyW");
  await until(() => self.z < 18);
  results.push(
    "Real movement reaches purchase barrier and crosses only after live phase under 200ms+ delay",
  );
  Object.assign(ally1, { x: -18, z: -10 });
  Object.assign(ally2, { x: 18, z: -10 });
  game.damage(self, 200, enemy);
  await page.locator("#spectator-controls").waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    document.querySelector("#spectate").textContent.includes("Ally One"),
  );
  await page.keyboard.press("BracketRight");
  await page.waitForFunction(() =>
    document.querySelector("#spectate").textContent.includes("Ally Two"),
  );
  await page.screenshot({ path: `${folder}/02-spectator.png` });
  await page.locator("#spectator-prev").click();
  await page.waitForFunction(() =>
    document.querySelector("#spectate").textContent.includes("Ally One"),
  );
  game.damage(ally1, 200, enemy);
  await page.waitForFunction(() =>
    document.querySelector("#spectate").textContent.includes("Ally Two"),
  );
  game.nextRound();
  await page.locator("#spectator-controls").waitFor({ state: "hidden" });
  results.push(
    "Keyboard/buttons cycle living teammates; death selects fallback; new round restores player",
  );
  assert.deepEqual(errors, []);
  const report = { date: reportDate(), results, errors };
  await writeFile(`${folder}/results.json`, JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  await browser.close();
  await proxy.close();
  await app.close();
}
