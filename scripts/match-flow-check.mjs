import "./browser-consent.mjs";
import { reportDate } from "./report-time.mjs";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "../server.mjs";
const app = createServer({ port: 0, host: "127.0.0.1" }),
  { port } = await app.listen();
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const errors = [],
  results = [],
  folder = "evidence/match-flow";
await mkdir(folder, { recursive: true });
async function until(fn) {
  for (let i = 0; i < 80 && !fn(); i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(fn(), "condition timed out");
}
try {
  const ca = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    cb = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ca.newPage(),
    b = await cb.newPage();
  for (const [page, name] of [
    [a, "Host"],
    [b, "Guest"],
  ]) {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.locator("#name").fill(name);
    await page.locator("#code").fill("FLOW");
    await page.locator("#join").click();
    await page.locator("#lobby").waitFor({ state: "visible" });
  }
  const game = app.rooms.get("FLOW"),
    host = [...game.players.values()].find((p) => p.name === "Host"),
    guest = [...game.players.values()].find((p) => p.name === "Guest");
  await b.locator("#team-atk").click();
  await until(() => guest.team === 0);
  await a.locator("#team-def").click();
  await until(() => host.team === 1);
  assert.equal(await b.locator("#overtime").isDisabled(), true);
  await a.locator("#overtime").check();
  await until(() => game.overtime);
  await b.waitForFunction(() => document.querySelector("#overtime").checked);
  await a.locator("#bots").click();
  await until(() => game.players.size === 10);
  await a.waitForFunction(
    () => document.querySelectorAll(".roster-row").length === 10,
  );
  await a.screenshot({ path: `${folder}/01-lobby.png` });
  await a.locator("#remove-bots").click();
  await until(() => game.players.size === 2);
  results.push(
    "Players choose their own team; only owner changes overtime and clears bots",
  );
  await a.locator("#start").click();
  await a.locator("#hud").waitFor({ state: "visible" });
  // Late-round fixtures use the same test-owned server; the client performs all menu actions.
  game.round = 24;
  game.score = [12, 12];
  game.nextRound();
  await a.waitForFunction(
    () => document.querySelector("#round").textContent === "OVERTIME 1",
  );
  await b.waitForFunction(
    () => document.querySelector("#round").textContent === "OVERTIME 1",
  );
  assert.equal(host.credits, 5000);
  await a.screenshot({ path: `${folder}/02-overtime.png` });
  game.round = 28;
  game.score = [14, 13];
  game.phase = "live";
  game.finish(0, "검증 경기 종료");
  game.end = game.time;
  await a.locator("#match-result").waitFor({ state: "visible" });
  await b.locator("#match-result").waitFor({ state: "visible" });
  assert.equal(await b.locator("#rematch").isDisabled(), true);
  assert.equal(await b.locator("#back-lobby").isDisabled(), true);
  await a.screenshot({ path: `${folder}/03-result.png` });
  await a.locator("#back-lobby").click();
  await b.locator("#lobby").waitFor({ state: "visible" });
  await a.locator("#start").click();
  await until(() => game.phase === "buy" && game.round === 1);
  game.phase = "live";
  game.score = [12, 0];
  game.finish(0, "리매치 검증");
  game.end = game.time;
  await a.locator("#match-result").waitFor({ state: "visible" });
  await a.locator("#rematch").click();
  await until(() => game.phase === "buy" && game.round === 1);
  await b.locator("#match-result").waitFor({ state: "hidden" });
  assert.deepEqual(game.score, [0, 0]);
  assert.equal(game.players.size, 2);
  results.push(
    "Both browsers show overtime and result; owner returns to lobby and rematches without reconnecting",
  );
  assert.deepEqual(errors, []);
  const report = { date: reportDate(), results, errors };
  await writeFile(`${folder}/results.json`, JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  await browser.close();
  await app.close();
}
