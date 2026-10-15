import "./browser-consent.mjs";
import { reportDate } from "./report-time.mjs";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "../server.mjs";
import { AGENTS } from "../shared.mjs";
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
  folder = "evidence/abilities";
await mkdir(folder, { recursive: true });
async function until(fn) {
  for (let i = 0; i < 80 && !fn(); i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(fn(), "condition timed out");
}
try {
  for (const [agent, config] of Object.entries(AGENTS)) {
    const ca = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      }),
      cb = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const a = await ca.newPage(),
      b = await cb.newPage();
    for (const [page, name] of [
      [a, "Caster"],
      [b, "Target"],
    ]) {
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${proxy.port}`);
      await page.locator("#name").fill(name);
      await page.locator("#code").fill("KIT" + agent.toUpperCase());
      if (page === a)
        await page.locator(".agent").filter({ hasText: config.name }).click();
      await page.locator("#join").click();
      await page.locator("#lobby").waitFor({ state: "visible" });
    }
    await a.locator("#start").click();
    await a.locator("#hud").waitFor({ state: "visible" });
    const game = app.rooms.get("KIT" + agent.toUpperCase()),
      caster = [...game.players.values()].find((p) => p.name === "Caster"),
      target = [...game.players.values()].find((p) => p.name === "Target");
    await a.keyboard.press("KeyB");
    await a.locator('[data-item="secondary"]').click();
    await until(() => caster.secondary === 1);
    assert.equal(caster.credits, 800 - config.secondary.cost);
    await a.waitForFunction(() =>
      document
        .querySelector('[data-item="secondary"]')
        .textContent.includes("보유 1 / 2"),
    );
    await a.screenshot({ path: `${folder}/${agent}-purchase.png` });
    await a.locator("#close-shop").click();
    game.end = game.time + 0.05;
    await a.waitForFunction(
      () => document.querySelector("#phase").textContent === "작전 진행",
    );
    Object.assign(caster, { x: -18, z: 0, yaw: 0 });
    Object.assign(target, { x: -18, z: -5 });
    await a.waitForTimeout(400);
    await a.locator("#resume").click();
    await a.keyboard.press("KeyC");
    await until(() => caster.secondary === 0);
    if (agent === "veil") {
      await b.waitForFunction(
        () =>
          Number(getComputedStyle(document.querySelector("#blind")).opacity) >
          0.5,
      );
      await b.screenshot({ path: `${folder}/veil-flash-target.png` });
    } else if (agent === "pulse") {
      await until(() => target.hp === 55);
      await b.waitForFunction(() =>
        document.querySelector("#health").textContent.trim().startsWith("55"),
      );
    } else await until(() => caster.y > 1);
    await a.screenshot({ path: `${folder}/${agent}-secondary.png` });
    // Test-only fixture seeds earned points; no production grant/debug route exists.
    caster.ultimate = config.ultimate.points;
    await a.waitForFunction(
      (points) =>
        document
          .querySelector("#ultimate")
          .textContent.includes(`${points}/${points}`),
      config.ultimate.points,
    );
    const oldZ = caster.z;
    await a.keyboard.press("KeyV");
    await until(() => caster.ultimate === 0);
    if (agent === "veil") assert.ok(caster.z < oldZ - 5);
    if (agent === "pulse") assert.ok(target.revealUntil > game.time + 6);
    if (agent === "dash") {
      assert.equal(caster.skill, 2);
      assert.ok(caster.focusUntil > game.time + 10);
    }
    await a.waitForFunction(
      (points) =>
        document.querySelector("#ultimate").textContent.includes(`0/${points}`),
      config.ultimate.points,
    );
    await a.screenshot({ path: `${folder}/${agent}-ultimate.png` });
    results.push(
      `${agent}: UI purchase, C effect, V charge consumption and HUD verified over 200ms+ round-trip delay`,
    );
    await ca.close();
    await cb.close();
  }
  assert.deepEqual(errors, []);
  const report = {
    date: reportDate(),
    results,
    errors,
    fixture:
      "Ultimate points seeded in test-owned Game; earning rules covered by unit tests",
  };
  await writeFile(`${folder}/results.json`, JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  await browser.close();
  await proxy.close();
  await app.close();
}
