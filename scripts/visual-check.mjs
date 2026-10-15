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
const folder = "evidence/visual",
  errors = [],
  fps = [];
await mkdir(folder, { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${folder}/01-world-menu.png` });
  await page.locator("#name").fill("Visual");
  await page.locator("#code").fill("ART45");
  await page.locator("#join").click();
  await page.locator("#lobby").waitFor({ state: "visible" });
  await page.locator("#bots").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".roster-row").length === 10,
  );
  await page.locator("#start").click();
  await page.locator("#hud").waitFor({ state: "visible" });
  const game = app.rooms.get("ART45");
  game.end = game.time + 100;
  const player = [...game.players.values()].find((p) => p.name === "Visual");
  for (const [type, name] of [
    ["pistol", "클래식"],
    ["rifle", "레이븐"],
    ["smg", "스펙터"],
    ["sniper", "오라클"],
    ["knife", "전술 나이프"],
  ]) {
    player.credits = 9000;
    if (type === "knife") game.select(player.id, 3);
    else game.buy(player.id, type);
    await page.waitForFunction(
      (name) => document.querySelector("#weapon").textContent.startsWith(name),
      name,
    );
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${folder}/weapon-${type}.png` });
  }
  game.select(player.id, 1);
  await page.waitForFunction(
    () => document.querySelector("#weapon").textContent === "오라클",
  );
  await page.locator("#resume").click();
  await page.mouse.down({ button: "right" });
  await page.locator("#scope").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${folder}/02-sniper-scope.png` });
  await page.mouse.up({ button: "right" });
  await page.locator("#scope").waitFor({ state: "hidden" });
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1000);
    fps.push(
      Number((await page.locator("#net").textContent()).match(/\d+/)[0]),
    );
  }
  assert.ok(
    fps.every((n) => n >= 25),
    `10-player render FPS ${fps}`,
  );
  await page.goto(`http://127.0.0.1:${port}/health`);
  const galleryStats = await page.evaluate(async () => {
    const map = document.createElement("script");
    map.type = "importmap";
    map.textContent = JSON.stringify({
      imports: { three: "/vendor/three.module.js" },
    });
    document.head.appendChild(map);
    const THREE = await import("/vendor/three.module.js"),
      art = await import("/art.mjs");
    document.body.innerHTML =
      '<div style="position:absolute;left:55px;top:38px;color:#dae9e6;font:700 28px Arial;letter-spacing:4px">RIFT / AGENT LINEUP</div><div style="position:absolute;left:55px;bottom:35px;color:#83a5af;font:14px Arial;letter-spacing:3px">VEIL　/　PULSE　/　JETSTREAM　 ·　ORIGINAL PROCEDURAL MODELS</div>';
    document.body.style.cssText = "margin:0;background:#142531;overflow:hidden";
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1440, 900);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#142531");
    scene.add(new THREE.HemisphereLight("#d4e5ef", "#455362", 2));
    const light = new THREE.DirectionalLight("#ffead4", 3);
    light.position.set(-3, 5, 4);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(40, 1440 / 900, 0.05, 30);
    camera.position.set(0, 1.3, 5.2);
    camera.lookAt(0, 1, 0);
    const rigs = [];
    for (const [agent, x] of [
      ["veil", -1.35],
      ["pulse", 0],
      ["dash", 1.35],
    ]) {
      const g = art.createAgent({
        agent,
        team: 0,
        weapon:
          agent === "veil" ? "rifle" : agent === "pulse" ? "smg" : "sniper",
        x,
        y: 0,
        z: 0,
      });
      g.rotation.y = Math.PI - 0.16;
      scene.add(g);
      rigs.push(g);
    }
    renderer.render(scene, camera);
    window.artGallery = { renderer, scene, camera, rigs, art, THREE };
    return {
      agentCount: rigs.length,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  });
  await page.screenshot({ path: `${folder}/03-agent-lineup.png` });
  await page.evaluate(() => {
    const { renderer, scene, camera, rigs, art } = window.artGallery;
    for (const g of rigs) art.disposeModel(g);
    document.body.firstElementChild.textContent = "RIFT / WEAPON COLLECTION";
    document.body.children[1].textContent =
      "CLASSIC　/　RAVEN　/　SPECTRE　/　ORACLE　/　TACTICAL KNIFE";
    camera.position.set(0, 2.8, 5.3);
    camera.lookAt(0, 0.2, 0);
    ["pistol", "rifle", "smg", "sniper", "knife"].forEach((type, i) => {
      const g = art.createWeapon(type);
      g.position.set((i - 2) * 0.95, 0.3, 0);
      g.rotation.y = 1.05;
      g.rotation.z = -0.1;
      scene.add(g);
    });
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: `${folder}/04-weapon-collection.png` });
  assert.deepEqual(errors, []);
  const result = {
    date: reportDate(),
    viewport: "1440x900",
    tenPlayerFpsSamples: fps,
    galleryStats,
    errors,
    verified: [
      "five first-person weapon silhouettes",
      "scope activation and release",
      "three original articulated rigs",
      "10-player render performance floor of 25 FPS in this Edge harness",
    ],
  };
  await writeFile(`${folder}/results.json`, JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  await browser.close();
  await app.close();
}
