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
  folder = "evidence/combat";
await mkdir(folder, { recursive: true });
const until = async (fn) => {
  for (let i = 0; i < 80 && !fn(); i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(fn(), "condition timed out");
};
try {
  const c1 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } }),
    a = await c1.newPage(),
    b = await c2.newPage();
  for (const [page, name] of [
    [a, "Shooter"],
    [b, "Target"],
  ]) {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${proxy.port}`);
    await page.locator("#name").fill(name);
    await page.locator("#code").fill("COMBAT");
    await page.locator("#join").click();
    await page.locator("#lobby").waitFor({ state: "visible" });
  }
  await a.locator("#start").click();
  await a.locator("#hud").waitFor({ state: "visible" });
  const game = app.rooms.get("COMBAT"),
    shooter = [...game.players.values()].find((p) => p.name === "Shooter"),
    target = [...game.players.values()].find((p) => p.name === "Target");
  shooter.credits = 5000;
  await a.keyboard.press("KeyB");
  await a.locator("#shop").waitFor({ state: "visible" });
  await a.getByRole("button", { name: /레이븐/ }).waitFor({ state: "visible" });
  await a.getByRole("button", { name: /레이븐/ }).click();
  await until(() => shooter.primary === "rifle");
  await a.locator("#close-shop").click();
  results.push("Purchase through UI updates authoritative inventory");
  game.end = game.time + 0.05;
  await a.waitForFunction(
    () => document.querySelector("#phase").textContent === "작전 진행",
  );
  shooter.x = -18;
  shooter.z = 0;
  target.x = -18;
  target.z = -5;
  await a.waitForTimeout(500);
  await a.locator("#resume").click();
  await a.waitForFunction(
    () => document.pointerLockElement === document.querySelector("#game"),
  );
  await a.keyboard.press("KeyX");
  await until(() => game.drops.length === 1);
  await a.waitForTimeout(150);
  await a.screenshot({ path: `${folder}/01-dropped-weapon.png` });
  await a.keyboard.press("KeyE");
  await until(() => shooter.primary === "rifle" && game.drops.length === 0);
  assert.equal(shooter.ammo, 25);
  results.push("Real X/E inputs drop and retrieve the purchased rifle");
  await a.keyboard.press("Digit2");
  await until(() => shooter.weapon === "pistol");
  await a.waitForTimeout(150);
  await a.screenshot({ path: `${folder}/02-visible-target.png` });
  await a.mouse.down();
  await a.waitForTimeout(110);
  await a.mouse.up();
  await until(() => target.hp < 100);
  assert.equal(target.hp, 22);
  results.push(
    "Crosshair aligned with rendered target produces a server-confirmed pistol headshot",
  );
  await b.waitForFunction(() =>
    document.querySelector("#health").textContent.trim().startsWith("22"),
  );
  results.push("Victim browser receives identical authoritative damage");
  await a.waitForTimeout(250);
  await a.mouse.down();
  await a.waitForTimeout(300);
  await a.mouse.up();
  await until(() => !target.alive);
  await a.waitForFunction(
    () => document.querySelector("#banner").textContent === "라운드 승리",
  );
  await b.waitForFunction(
    () => document.querySelector("#banner").textContent === "라운드 패배",
  );
  assert.equal(shooter.kills, 1);
  assert.equal(target.deaths, 1);
  assert.equal(game.score[0], 1);
  results.push(
    "Both browsers agree on kill, death, score and round result under 200ms+ jitter",
  );
  await a.screenshot({ path: `${folder}/03-round-win.png` });
  await b.screenshot({ path: `${folder}/04-round-loss.png` });
  assert.deepEqual(errors, []);
  await writeFile(
    `${folder}/results.json`,
    JSON.stringify(
      { date: reportDate(), oneWayDelayMs: 100, jitterMs: 20, results, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
  await proxy.close();
  await app.close();
}
