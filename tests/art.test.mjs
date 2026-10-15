import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createAgent,
  animateAgent,
  createWeapon,
  disposeModel,
  reloadPose,
  animateWeaponReload,
} from "../public/art.mjs";
import { rayPlayer } from "../shared.mjs";
const pose = { x: 0, y: 0, z: -5, yaw: 0, crouch: false };

test("third-person reload lowers the aim rig and restores magazine and posture on cancellation", () => {
  const p = {
    agent: "veil",
    team: 0,
    weapon: "rifle",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0.3,
    reloadProgress: 0.45,
  };
  const g = createAgent(p);
  animateAgent(g, p, 1 / 60);
  const data = g.userData;
  assert.ok(data.aimRoot.position.y < 1.14);
  assert.ok(data.aimRoot.rotation.x > p.pitch * 0.65);
  assert.ok(
    data.weapon.userData.magazine.position.y <
      data.weapon.userData.magazineRest.y,
  );
  p.reloadProgress = null;
  animateAgent(g, p, 1 / 60);
  assert.equal(data.aimRoot.position.y, 1.14);
  assert.equal(data.aimRoot.rotation.x, p.pitch * 0.65);
  assert.equal(Math.abs(data.aimRoot.rotation.z), 0);
  assert.deepEqual(
    data.weapon.userData.magazine.position,
    data.weapon.userData.magazineRest,
  );
  p.weapon = "knife";
  animateAgent(g, p, 1 / 60);
  g.updateMatrixWorld(true);
  g.traverse((o) => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
  disposeModel(g);
});
test("reload follows server time, waits for equip, and clears magazine offset on cancellation", () => {
  const p = { reloadUntil: 4, equipUntil: 2 };
  assert.deepEqual(reloadPose(p, 1, 2), { progress: 0, lower: 0, magazine: 0 });
  assert.equal(reloadPose(p, 2, 2).lower, 0);
  const middle = reloadPose(p, 3, 2);
  assert.equal(middle.lower, 1);
  assert.equal(middle.magazine, 1);
  assert.ok(reloadPose(p, 3.95, 2).lower < 0.05);
  assert.equal(reloadPose(p, 4, 2).magazine, 0);
  for (const type of [
    "pistol",
    "rifle",
    "smg",
    "sniper",
    "shotgun",
    "burstRifle",
  ]) {
    const model = createWeapon(type, { view: true });
    const original = model.userData.magazine.position.clone();
    animateWeaponReload(model, middle);
    assert.ok(model.userData.magazine.position.y < original.y - 0.2);
    animateWeaponReload(model, reloadPose({ reloadUntil: 0 }, 3, 2));
    assert.ok(model.userData.magazine.position.equals(original));
    disposeModel(model);
  }
  const knife = createWeapon("knife");
  animateWeaponReload(knife, middle);
  disposeModel(knife);
});
test("directional gait follows travel, bends crouched knees and freezes airborne stride", () => {
  const p = {
    agent: "veil",
    team: 0,
    weapon: "rifle",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
  };
  const g = createAgent(p);
  for (let i = 0; i < 12; i++) {
    p.x += 0.05;
    animateAgent(g, p, 1 / 60);
  }
  assert.ok(Math.abs(g.userData.legs[0].rotation.z) > 0.05);
  assert.ok(Math.abs(g.userData.legs[0].rotation.x) < 0.001);
  const phase = g.userData.walkPhase;
  p.y = 1;
  for (let i = 0; i < 30; i++) {
    p.x += 0.02;
    animateAgent(g, p, 1 / 60);
  }
  assert.equal(g.userData.walkPhase, phase);
  assert.ok(g.userData.legs[0].userData.knee.rotation.x > 0.6);
  p.y = 0;
  p.crouch = true;
  for (let i = 0; i < 60; i++) animateAgent(g, p, 1 / 60);
  assert.ok(Math.abs(g.userData.legs[0].rotation.x + 0.45) < 0.002);
  assert.ok(
    Math.abs(g.userData.legs[0].userData.knee.rotation.x - 0.9) < 0.002,
  );
  assert.equal(g.scale.y, 0.73);
  p.x += 20;
  p.crouch = false;
  animateAgent(g, p, 1 / 60);
  assert.equal(g.userData.walkPhase, 0);
  assert.ok(Math.abs(g.userData.legs[0].rotation.x) < 1e-8);
  g.updateMatrixWorld(true);
  g.traverse((o) => assert.ok(o.matrix.elements.every(Number.isFinite)));
  disposeModel(g);
});
test("gait phase depends on travelled distance across frame rates", () => {
  const phases = [];
  for (const hz of [30, 60, 120]) {
    const p = {
      agent: "dash",
      team: 0,
      weapon: "knife",
      x: 0,
      y: 0,
      z: 0,
      yaw: Math.PI / 2,
      pitch: 0,
    };
    const g = createAgent(p);
    for (let i = 0; i < hz; i++) {
      p.x -= 3 / hz;
      animateAgent(g, p, 1 / hz);
    }
    phases.push(g.userData.walkPhase);
    assert.ok(Math.abs(g.userData.legs[0].rotation.z) < 1e-8);
    disposeModel(g);
  }
  assert.ok(Math.max(...phases) - Math.min(...phases) < 1e-8);
});
test("head and body regions follow the visual silhouette rather than the old wide box", () => {
  assert.equal(rayPlayer([0, 1.65, 0], [0, 0, -1], pose).head, true);
  assert.equal(rayPlayer([0.28, 1.7, 0], [0, 0, -1], pose).distance, Infinity);
  assert.equal(rayPlayer([0, 1.2, 0], [0, 0, -1], pose).region, "body");
  assert.equal(rayPlayer([0, 0.4, 0], [0, 0, -1], pose).region, "legs");
  assert.equal(
    rayPlayer([0, 1.65, 0], [0, 0, -1], { ...pose, crouch: true }).distance,
    Infinity,
  );
  assert.equal(
    rayPlayer([0, 1.2, 0], [0, 0, -1], { ...pose, crouch: true }).head,
    true,
  );
});
test("hit regions rotate with the character", () => {
  const hit = rayPlayer([0, 0.95, 0], [0, 0, -1], {
    ...pose,
    yaw: Math.PI / 2,
  });
  assert.ok(Math.abs(hit.distance - 4.75) < 1e-6);
});
test("all agent rigs fit a human height, animate finite joints, and use bounded geometry", () => {
  for (const agent of ["veil", "pulse", "dash", "haven"]) {
    const player = {
      agent,
      team: 0,
      weapon: "rifle",
      x: 0,
      y: 0,
      z: 0,
      pitch: 0,
      crouch: false,
    };
    const g = createAgent(player);
    g.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(g);
    assert.ok(bounds.min.y >= -0.01 && bounds.max.y < 1.9);
    assert.ok(bounds.max.y > 1.8);
    let meshes = 0;
    g.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        const a = o.geometry.attributes.position.array;
        assert.ok([...a].every(Number.isFinite));
      }
    });
    assert.ok(meshes < 100);
    animateAgent(g, { ...player, x: 0.1 }, 1 / 60);
    assert.ok(Number.isFinite(g.userData.legs[0].rotation.x));
    animateAgent(
      g,
      { ...player, weapon: "sniper", x: 0.2, crouch: true },
      1 / 60,
    );
    assert.equal(g.userData.weapon.userData.weapon, "sniper");
    assert.equal(g.scale.y, 0.73);
    disposeModel(g);
  }
});
test("weapons have distinct lengths and first-person materials retain internal depth", () => {
  const lengths = {};
  for (const type of [
    "pistol",
    "smg",
    "rifle",
    "sniper",
    "shotgun",
    "burstRifle",
    "knife",
  ]) {
    const g = createWeapon(type);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    lengths[type] = box.max.z - box.min.z;
    assert.ok(lengths[type] > 0.2);
    disposeModel(g);
  }
  assert.ok(
    lengths.sniper > lengths.rifle &&
      lengths.rifle > lengths.smg &&
      lengths.smg > lengths.pistol,
  );
  const view = createWeapon("rifle", { view: true });
  view.traverse((o) => {
    if (o.isMesh) {
      assert.equal(o.material.depthTest, true);
      assert.equal(o.castShadow, false);
    }
  });
  disposeModel(view);
});
