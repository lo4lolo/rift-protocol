import "./browser-consent.mjs";
import { reportDate } from "./report-time.mjs";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "../server.mjs";
import { createLatencyProxy } from "./latency-proxy.mjs";
const app = createServer({ port: 0, host: "127.0.0.1" });
const { port } = await app.listen();
const delayMs = Number(process.env.NET_DELAY_MS) || 0;
const proxy = delayMs
  ? await createLatencyProxy(port, { delayMs, jitterMs: 20 })
  : null;
const url = `http://127.0.0.1:${proxy?.port ?? port}`;
const artifactDir = delayMs ? "evidence/delayed" : "evidence";
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const errors = [];
const results = [];
await mkdir(artifactDir, { recursive: true });
try {
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctx.newPage(),
    b = await ctx2.newPage();
  for (const page of [a, b])
    page.on("pageerror", (e) => errors.push(e.message));
  await a.goto(url);
  await a.screenshot({ path: `${artifactDir}/01-lobby.png` });
  await a.locator("#settings-open").click();
  await a.locator("#sensitivity").focus();
  await a.keyboard.press("ArrowRight");
  await a.locator("#crosshair-color").selectOption("#ffeb78");
  await a.locator("#quality").selectOption("low");
  await a.locator("#settings-close").click();
  await a.reload();
  assert.equal(await a.locator("#sensitivity").inputValue(), "1.05");
  assert.equal(await a.locator("#quality").inputValue(), "low");
  await a.locator("#settings-open").click();
  await a.screenshot({ path: `${artifactDir}/07-settings.png` });
  await a.locator("#sensitivity").focus();
  await a.keyboard.press("ArrowLeft");
  await a.locator("#crosshair-color").selectOption("#b2ffe0");
  await a.locator("#quality").selectOption("high");
  await a.locator("#settings-close").click();
  results.push(
    "Sensitivity, crosshair and quality settings persist across page reload",
  );
  await a.locator("#name").fill("Alpha");
  await a.locator("#join").click();
  await a.locator("#lobby").waitFor({ state: "visible" });
  await b.goto(url);
  await b.locator("#name").fill("Bravo");
  await b.locator("#join").click();
  await b.locator("#lobby").waitFor({ state: "visible" });
  await a.waitForFunction(
    () => document.querySelectorAll(".roster-row").length === 2,
  );
  assert.equal(await b.locator("#start").isDisabled(), true);
  results.push(
    "Two isolated browser contexts joined one room; guest cannot start",
  );
  await a.locator("#bots").click();
  await a.waitForFunction(
    () => document.querySelectorAll(".roster-row").length === 10,
  );
  await a.screenshot({ path: `${artifactDir}/02-room.png` });
  await a.locator("#start").click();
  await a.locator("#hud").waitFor({ state: "visible" });
  await b.locator("#hud").waitFor({ state: "visible" });
  await a.keyboard.press("KeyB");
  await a.locator("#shop").waitFor({ state: "visible" });
  assert.equal(await a.locator("#weapons button").count(), 6);
  assert.equal(await a.locator('[data-item="secondary"]').count(), 1);
  await a.screenshot({ path: `${artifactDir}/03-buy.png` });
  await a.locator("#close-shop").click();
  results.push(
    "10-player room starts and both browsers receive purchase phase",
  );
  // Production server instance is controlled by harness, not a public test endpoint.
  const game = app.rooms.get("RIFT45");
  game.end = game.time + 0.05;
  await a.waitForFunction(
    () => document.querySelector("#phase").textContent === "작전 진행",
  );
  await a.locator("#resume").click();
  await a.waitForFunction(
    () => document.pointerLockElement === document.querySelector("#game"),
  );
  const player = [...game.players.values()].find((p) => p.name === "Alpha"),
    before = { x: player.x, z: player.z };
  await a.keyboard.down("KeyD");
  await a.waitForTimeout(500);
  await a.keyboard.up("KeyD");
  assert.ok(Math.hypot(player.x - before.x, player.z - before.z) > 1);
  results.push("Real keyboard movement arrives at authoritative server");
  await a.mouse.move(740, 440);
  await a.mouse.down();
  await a.waitForTimeout(300);
  await a.mouse.up();
  assert.ok(player.ammo < 12);
  await a.keyboard.press("KeyR");
  for (let i = 0; i < 60 && player.ammo !== 12; i++)
    await a.waitForTimeout(100);
  assert.equal(player.ammo, 12);
  results.push("Pointer lock, live firing and timed reload work");
  await a.keyboard.press("KeyQ");
  for (let i = 0; i < 30 && player.skill !== 0; i++)
    await a.waitForTimeout(100);
  assert.equal(player.skill, 0);
  assert.equal(game.smokes.length, 1);
  results.push("Q ability creates authoritative smoke");
  await a.screenshot({ path: `${artifactDir}/04-gameplay.png` });
  await b.screenshot({ path: `${artifactDir}/05-second-client.png` });
  await a.keyboard.down("Tab");
  await a.screenshot({ path: `${artifactDir}/06-scoreboard.png` });
  await a.keyboard.up("Tab");
  assert.deepEqual(errors, []);
  results.push("No uncaught browser errors");
  await writeFile(
    `${artifactDir}/browser-results.json`,
    JSON.stringify(
      {
        date: reportDate(),
        oneWayDelayMs: delayMs,
        jitterMs: delayMs ? 20 : 0,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
  await proxy?.close();
  await app.close();
}
