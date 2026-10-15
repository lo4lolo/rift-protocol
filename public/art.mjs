import * as THREE from "three";

const palette = new Map();
export function surface(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!palette.has(key))
    palette.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...options }),
    );
  return palette.get(key);
}
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function block(parent, size, pos, color, options = {}) {
  return mesh(
    parent,
    new THREE.BoxGeometry(...size),
    surface(color, options),
    ...pos,
  );
}
function roundBlock(parent, size, pos, color, bevel = 0.012) {
  const [w, h, d] = size,
    r = Math.min(bevel, w / 4, h / 4, d / 4),
    shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.lineTo(w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.lineTo(w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.lineTo(-w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * r,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: r,
    bevelThickness: r,
  });
  geo.translate(0, 0, -d / 2 + r);
  return mesh(
    parent,
    geo,
    surface(color, { metalness: 0.25, roughness: 0.46 }),
    ...pos,
  );
}
function tube(parent, top, bottom, length, pos, color, segments = 10) {
  return mesh(
    parent,
    new THREE.CylinderGeometry(top, bottom, length, segments),
    surface(color),
    ...pos,
  );
}
function ellipsoid(parent, scale, pos, color) {
  const m = mesh(
    parent,
    new THREE.SphereGeometry(1, 12, 8),
    surface(color),
    ...pos,
  );
  m.scale.set(...scale);
  return m;
}
export function disposeModel(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.userData.ownedMaterial) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
  group.removeFromParent();
}

export function createWeapon(type, { view = false } = {}) {
  const g = new THREE.Group(),
    steel = "#273741",
    dark = "#131e27",
    grip = "#46515a",
    accent = "#8aafa5";
  if (type === "knife") {
    const blade = new THREE.Shape();
    blade.moveTo(-0.035, 0.04);
    blade.lineTo(-0.026, -0.34);
    blade.lineTo(0, -0.48);
    blade.lineTo(0.035, -0.31);
    blade.lineTo(0.035, 0.04);
    blade.closePath();
    const geo = new THREE.ExtrudeGeometry(blade, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.003,
      bevelSegments: 1,
      steps: 1,
    });
    geo.rotateX(Math.PI / 2);
    mesh(g, geo, surface("#a9c2c7", { metalness: 0.8, roughness: 0.25 }));
    roundBlock(g, [0.065, 0.06, 0.18], [0, 0, 0.12], dark);
    block(g, [0.16, 0.035, 0.035], [0, 0, 0.015], steel);
    for (let i = 0; i < 5; i++)
      block(g, [0.068, 0.065, 0.008], [0, 0, 0.06 + i * 0.026], grip);
  } else if (type === "pistol") {
    g.userData.magazine = roundBlock(
      g,
      [0.054, 0.12, 0.07],
      [0, -0.17, 0.025],
      dark,
    );
    roundBlock(g, [0.078, 0.075, 0.29], [0, 0.015, -0.1], steel);
    roundBlock(g, [0.072, 0.045, 0.25], [0, -0.04, -0.08], dark);
    roundBlock(g, [0.07, 0.15, 0.095], [0, -0.12, 0.025], grip).rotation.x =
      -0.25;
    const barrel = tube(g, 0.022, 0.022, 0.045, [0, 0.018, -0.264], dark, 12);
    barrel.rotation.x = Math.PI / 2;
    block(g, [0.014, 0.018, 0.02], [0, 0.06, -0.225], "#83d1bb");
    block(g, [0.045, 0.02, 0.015], [0, 0.06, 0.025], dark);
    for (let i = 0; i < 5; i++)
      block(g, [0.081, 0.052, 0.006], [0, 0.02, 0.002 - i * 0.012], dark);
    const guard = mesh(
      g,
      new THREE.TorusGeometry(0.038, 0.006, 5, 12, Math.PI * 1.7),
      surface(steel),
      0,
      -0.09,
      -0.065,
    );
    guard.rotation.y = Math.PI / 2;
    block(g, [0.014, 0.04, 0.012], [0, -0.075, -0.065], dark).rotation.x = -0.2;
  } else {
    const sniper = type === "sniper",
      smg = type === "smg",
      shotgun = type === "shotgun",
      length = sniper ? 0.63 : smg ? 0.31 : shotgun ? 0.5 : 0.45;
    roundBlock(g, [0.092, 0.12, length], [0, 0, -0.16], steel);
    roundBlock(g, [0.083, 0.055, length * 0.8], [0, 0.075, -0.16], dark);
    roundBlock(g, [0.068, 0.18, 0.1], [0, -0.13, 0.07], grip).rotation.x =
      -0.27;
    g.userData.magazine = roundBlock(
      g,
      [
        shotgun ? 0.11 : 0.073,
        shotgun ? 0.14 : 0.22,
        smg ? 0.065 : shotgun ? 0.14 : 0.1,
      ],
      [0, -0.16, -0.14],
      dark,
    );
    g.userData.magazine.rotation.x = 0.17;
    const barrel = tube(
      g,
      shotgun ? 0.035 : 0.019,
      shotgun ? 0.035 : 0.024,
      sniper ? 0.4 : smg ? 0.13 : 0.24,
      [0, 0.015, -0.16 - length / 2 - (sniper ? 0.2 : smg ? 0.065 : 0.12)],
      dark,
      12,
    );
    barrel.rotation.x = Math.PI / 2;
    if (shotgun) {
      roundBlock(g, [0.12, 0.09, 0.23], [0, -0.055, -0.4], "#916b47");
      for (let i = 0; i < 4; i++)
        block(
          g,
          [0.025, 0.06, 0.025],
          [0.06, 0.01, -0.08 + i * 0.04],
          "#b89d61",
        );
    }
    if (type === "burstRifle") {
      roundBlock(g, [0.11, 0.075, 0.16], [0, 0.12, -0.12], "#596f79");
      for (let i = 0; i < 3; i++)
        block(g, [0.01, 0.045, 0.018], [0.055, 0, -0.2 + i * 0.04], "#d5a86c");
    }
    roundBlock(g, [0.082, 0.105, 0.22], [0, -0.025, 0.24], grip);
    tube(g, 0.024, 0.024, 0.15, [0, -0.025, 0.1], steel).rotation.x =
      Math.PI / 2;
    roundBlock(g, [0.1, 0.16, 0.035], [0, -0.04, 0.36], dark);
    roundBlock(g, [0.1, 0.07, length * 0.52], [0, -0.07, -0.31], grip);
    for (let i = 0; i < (smg ? 3 : 6); i++)
      block(g, [0.097, 0.015, 0.012], [0, 0.069, -0.3 + i * 0.035], "#66706e");
    block(g, [0.096, 0.014, 0.13], [0, 0.04, -0.1], accent);
    if (sniper) {
      block(g, [0.04, 0.08, 0.19], [0, 0.12, -0.08], dark);
      const scope = tube(g, 0.038, 0.038, 0.3, [0, 0.18, -0.1], steel, 12);
      scope.rotation.x = Math.PI / 2;
      for (const z of [-0.26, 0.06]) {
        const lens = tube(g, 0.044, 0.044, 0.025, [0, 0.18, z], "#65a9ad", 12);
        lens.rotation.x = Math.PI / 2;
      }
      tube(g, 0.026, 0.026, 0.05, [0.05, 0.18, -0.1], dark).rotation.z =
        Math.PI / 2;
    } else {
      block(g, [0.012, 0.038, 0.02], [0, 0.1, -0.16 - length / 2 + 0.03], dark);
      block(g, [0.047, 0.028, 0.018], [0, 0.11, 0.02], dark);
    }
  }
  if (g.userData.magazine)
    g.userData.magazineRest = g.userData.magazine.position.clone();
  if (type !== "knife") {
    const star = new THREE.Shape();
    for (let i = 0; i < 12; i++) {
      const r = i % 2 ? 0.018 : 0.065,
        a = (i * Math.PI) / 6,
        x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      i ? star.lineTo(x, y) : star.moveTo(x, y);
    }
    star.closePath();
    const flash = mesh(
      g,
      new THREE.ShapeGeometry(star),
      new THREE.MeshBasicMaterial({
        color: "#ffe6a8",
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      0,
      0.018,
      type === "pistol"
        ? -0.29
        : type === "sniper"
          ? -0.88
          : type === "smg"
            ? -0.455
            : type === "shotgun"
              ? -0.67
              : -0.64,
    );
    flash.visible = false;
    flash.castShadow = false;
    flash.userData.ownedMaterial = true;
    flash.userData.flash = true;
    g.userData.flash = flash;
  }
  if (view) {
    // Hands and sleeves use the same world scale as the weapon.
    ellipsoid(g, [0.055, 0.065, 0.09], [0.018, -0.13, 0.07], "#a9826e");
    roundBlock(g, [0.1, 0.1, 0.17], [0.035, -0.16, 0.21], "#283c46");
    const arm = tube(g, 0.054, 0.07, 0.27, [0.075, -0.19, 0.38], "#334e59");
    arm.rotation.x = 1.2;
    if (type !== "pistol" && type !== "knife") {
      ellipsoid(g, [0.053, 0.05, 0.078], [-0.045, -0.1, -0.32], "#a9826e");
      const arm2 = tube(g, 0.05, 0.075, 0.32, [-0.095, -0.2, -0.13], "#334e59");
      arm2.rotation.x = -0.8;
      arm2.rotation.z = -0.3;
    }
    g.traverse((o) => {
      if (o.isMesh) {
        const original = o.material;
        o.material = o.material.clone();
        if (o.userData.ownedMaterial) original.dispose();
        o.material.depthTest = true;
        o.material.depthWrite = !o.userData.flash;
        o.userData.ownedMaterial = true;
        o.renderOrder = 0;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
  }
  g.userData.weapon = type;
  return g;
}

export function reloadPose(p, time, duration) {
  if (!duration || !(p.reloadUntil > time) || p.equipUntil > time)
    return { progress: 0, lower: 0, magazine: 0 };
  const progress = THREE.MathUtils.clamp(
    1 - (p.reloadUntil - time) / duration,
    0,
    1,
  );
  return reloadProgressPose(progress);
}
export function reloadProgressPose(value) {
  if (!Number.isFinite(value)) return { progress: 0, lower: 0, magazine: 0 };
  const progress = THREE.MathUtils.clamp(value, 0, 1);
  const ramp = (a, b) => THREE.MathUtils.smoothstep(progress, a, b);
  return {
    progress,
    lower: ramp(0, 0.18) * (1 - ramp(0.78, 1)),
    magazine: ramp(0.18, 0.35) * (1 - ramp(0.55, 0.75)),
  };
}
export function animateWeaponReload(model, pose) {
  const { magazine, magazineRest } = model?.userData || {};
  if (!magazine) return;
  magazine.position.copy(magazineRest);
  magazine.position.y -= pose.magazine * 0.24;
  magazine.position.x -= pose.magazine * 0.05;
}
export function createAgent(player) {
  const g = new THREE.Group(),
    team = player.team === 0 ? "#367f80" : "#a54f61",
    cloth =
      player.agent === "veil"
        ? "#40485c"
        : player.agent === "haven"
          ? "#c4d8d2"
          : player.agent === "pulse"
            ? "#32515b"
            : "#4d555d",
    accent =
      player.agent === "veil"
        ? "#a5a9dc"
        : player.agent === "haven"
          ? "#8ce2bd"
          : player.agent === "pulse"
            ? "#6fdac7"
            : "#f1c58e";
  const hips = tube(g, 0.18, 0.16, 0.19, [0, 0.88, 0], "#26343f");
  hips.scale.z = 0.74;
  const chest = tube(g, 0.245, 0.17, 0.46, [0, 1.19, 0], cloth, 8);
  chest.scale.z = 0.65;
  roundBlock(g, [0.32, 0.3, 0.075], [0, 1.2, -0.13], team, 0.022);
  for (const x of [-0.105, 0.005, 0.11])
    roundBlock(g, [0.085, 0.12, 0.05], [x, 1.09, -0.18], "#273c47", 0.01);
  block(g, [0.27, 0.025, 0.02], [0, 1.36, -0.17], accent);
  roundBlock(g, [0.3, 0.34, 0.09], [0, 1.19, 0.14], "#263b45");
  block(g, [0.08, 0.26, 0.025], [0, 1.21, 0.2], accent);
  tube(g, 0.063, 0.07, 0.1, [0, 1.46, 0], "#b58c76");
  const head = new THREE.Group();
  head.position.y = 1.67;
  g.add(head);
  ellipsoid(head, [0.137, 0.175, 0.13], [0, 0, 0], "#c2987e");
  ellipsoid(
    head,
    [0.148, 0.115, 0.135],
    [0, 0.078, 0.018],
    player.agent === "dash" ? "#d9d6c7" : "#303b46",
  );
  roundBlock(head, [0.24, 0.052, 0.032], [0, 0.018, -0.122], "#23343e", 0.006);
  block(head, [0.17, 0.018, 0.008], [0, 0.021, -0.143], accent);
  ellipsoid(head, [0.035, 0.05, 0.045], [0, -0.032, -0.125], "#c2987e");
  if (player.agent === "veil") {
    roundBlock(g, [0.34, 0.15, 0.2], [0, 1.46, 0.06], cloth, 0.025);
  }
  if (player.agent === "pulse") {
    tube(head, 0.047, 0.047, 0.025, [-0.148, 0, 0.01], team).rotation.z =
      Math.PI / 2;
    block(head, [0.015, 0.08, 0.02], [-0.165, 0.07, 0.01], accent);
  }
  const legs = [],
    aimRoot = new THREE.Group();
  aimRoot.position.y = 1.14;
  g.add(aimRoot);
  function limb(a, b, r1, r2, color) {
    const from = new THREE.Vector3(a[0], a[1] - 1.14, a[2]),
      to = new THREE.Vector3(b[0], b[1] - 1.14, b[2]),
      delta = to.clone().sub(from),
      center = from.clone().add(to).multiplyScalar(0.5);
    const part = tube(aimRoot, r1, r2, delta.length(), center.toArray(), color);
    part.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    return part;
  }
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.105, 0.82, 0);
    g.add(leg);
    legs.push(leg);
    tube(leg, 0.085, 0.068, 0.37, [0, -0.18, 0], "#253640");
    const knee = new THREE.Group();
    knee.position.y = -0.37;
    leg.add(knee);
    leg.userData.knee = knee;
    roundBlock(knee, [0.13, 0.13, 0.05], [0, 0, -0.075], team, 0.015);
    tube(knee, 0.065, 0.048, 0.34, [0, -0.18, 0.005], "#34434b");
    roundBlock(knee, [0.14, 0.12, 0.24], [0, -0.38, -0.04], "#1c2b35", 0.02);
    const shoulder = [side * 0.245, 1.38, 0],
      elbow = side === 1 ? [0.29, 1.09, -0.05] : [-0.15, 1.09, -0.22],
      hand = side === 1 ? [0.13, 1.02, -0.32] : [0.04, 1.07, -0.5];
    limb(shoulder, elbow, 0.075, 0.062, cloth);
    limb(elbow, hand, 0.061, 0.045, "#42515a");
    ellipsoid(
      aimRoot,
      [0.09, 0.1, 0.095],
      [shoulder[0], shoulder[1] - 1.14, shoulder[2]],
      team,
    );
    ellipsoid(
      aimRoot,
      [0.048, 0.055, 0.068],
      [hand[0], hand[1] - 1.14, hand[2]],
      "#9e7c68",
    );
  }
  const weapon = createWeapon(player.weapon);
  weapon.position.set(0.13, -0.02, -0.38);
  weapon.scale.setScalar(0.85);
  aimRoot.add(weapon);
  g.userData = {
    legs,
    head,
    weapon,
    aimRoot,
    team: player.team,
    agent: player.agent,
    walkPhase: 0,
    lastX: player.x,
    lastZ: player.z,
    airborne: false,
    landing: 0,
  };
  g.position.set(player.x, player.y, player.z);
  return g;
}
export function animateAgent(g, p, dt) {
  const data = g.userData,
    dx = p.x - data.lastX,
    dz = p.z - data.lastZ,
    distance = Math.hypot(dx, dz),
    teleported = distance > 1.5,
    speed = teleported ? 0 : Math.min(7, distance / Math.max(dt, 0.001)),
    yaw = p.yaw || 0,
    forward =
      distance > 0.0001
        ? (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / distance
        : 0,
    lateral =
      distance > 0.0001
        ? (Math.cos(yaw) * dx - Math.sin(yaw) * dz) / distance
        : 0,
    airborne = p.y > 0.08,
    blend = teleported ? 1 : 1 - Math.exp(-18 * Math.max(0, dt));
  data.lastX = p.x;
  data.lastZ = p.z;
  if (data.airborne && !airborne && !teleported) data.landing = 1;
  data.airborne = airborne;
  data.landing = teleported ? 0 : data.landing * Math.exp(-12 * dt);
  if (teleported) data.walkPhase = 0;
  else if (!airborne)
    data.walkPhase =
      (data.walkPhase + (distance * Math.PI * 2) / (p.crouch ? 1.6 : 3.4)) %
      (Math.PI * 2);
  data.legs.forEach((leg, i) => {
    const swing =
      Math.sin(data.walkPhase + i * Math.PI) *
      Math.min(p.crouch ? 0.24 : 0.6, speed * 0.11);
    const hip = airborne
      ? i
        ? 0.15
        : -0.45
      : swing * forward - (p.crouch ? 0.45 : 0) - data.landing * 0.12;
    const side = airborne ? 0 : -swing * lateral * 0.65;
    const knee = airborne
      ? 0.65
      : (p.crouch ? 0.9 : 0) + Math.max(0, -swing) * 0.7 + data.landing * 0.3;
    leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, hip, blend);
    leg.rotation.z = THREE.MathUtils.lerp(leg.rotation.z, side, blend);
    leg.position.y = THREE.MathUtils.lerp(
      leg.position.y,
      p.crouch ? 0.75 : 0.82,
      blend,
    );
    leg.userData.knee.rotation.x = THREE.MathUtils.lerp(
      leg.userData.knee.rotation.x,
      knee,
      blend,
    );
  });
  data.head.rotation.x = p.pitch * 0.45;
  if (data.weapon.userData.weapon !== p.weapon) {
    disposeModel(data.weapon);
    data.weapon = createWeapon(p.weapon);
    data.weapon.position.set(0.13, -0.02, -0.38);
    data.weapon.scale.setScalar(0.85);
    data.aimRoot.add(data.weapon);
  }
  const reload = reloadProgressPose(p.reloadProgress);
  data.aimRoot.rotation.x = p.pitch * 0.65 + reload.lower * 0.28;
  data.aimRoot.rotation.z = -reload.lower * 0.18;
  data.aimRoot.position.y = 1.14 - reload.lower * 0.06;
  animateWeaponReload(data.weapon, reload);
  if (data.weapon.userData.flash)
    data.weapon.userData.flash.visible =
      performance.now() < (data.flashUntil || 0);
  g.scale.y = p.crouch ? 0.73 : 1;
}

function canvasTexture(draw, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  draw(c.getContext("2d"));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}
function sign(
  parent,
  text,
  pos,
  size,
  color = "#e8e1cc",
  background = null,
  rotation = 0,
) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 512, 256);
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 96px Arial";
  ctx.fillText(text, 256, 128, 480);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = mesh(
    parent,
    new THREE.PlaneGeometry(size * 2, size),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
    }),
    ...pos,
  );
  m.rotation.y = rotation;
  m.castShadow = false;
  return m;
}
export function buildWorld(scene, map) {
  scene.background = new THREE.Color("#8ab8cd");
  scene.fog = new THREE.Fog("#a4c5ce", 65, 160);
  const groundTex = canvasTexture((ctx) => {
    ctx.fillStyle = "#b2b4a7";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#999f97";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    let seed = 5;
    for (let i = 0; i < 2500; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = seed % 256;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      ctx.fillStyle = i % 2 ? "#ffffff0a" : "#00000007";
      ctx.fillRect(x, seed % 256, 2, 2);
    }
  }, 15);
  const floor = mesh(
    scene,
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.97 }),
    0,
    0.001,
    0,
  );
  floor.rotation.x = -Math.PI / 2;
  const water = mesh(
    scene,
    new THREE.PlaneGeometry(240, 240),
    surface("#397a92", { roughness: 0.32, metalness: 0.15 }),
    0,
    -0.5,
    0,
  );
  water.rotation.x = -Math.PI / 2;
  const batches = new Map();
  function box(size, pos, color, rotation = 0) {
    const mat = surface(color),
      key = mat.uuid;
    if (!batches.has(key)) batches.set(key, { mat, items: [] });
    batches.get(key).items.push({ size, pos, rotation });
  }
  for (const [x, z, w, d, h] of map.walls) {
    const crate = h <= 3,
      zone = x < 0 ? "#c2b4a1" : "#bcc6bb",
      base = crate ? "#486e70" : zone;
    box([w, h, d], [x, h / 2, z], base);
    box(
      [w + 0.12, 0.16, d + 0.12],
      [x, h - 0.06, z],
      crate ? "#2a444b" : "#657f79",
    );
    if (!crate) {
      box([w + 0.035, 0.65, d + 0.035], [x, 0.325, z], "#527d77");
      box([w + 0.05, 0.05, d + 0.05], [x, 0.73, z], "#93aca0");
      const wide = w > d;
      if (wide) {
        for (let a = -w / 2 + 2; a < w / 2; a += 4) {
          box(
            [0.12, h - 0.25, d + 0.06],
            [x + a, (h - 0.25) / 2, z],
            "#b0b2a1",
          );
          if (h >= 5 && w > 8)
            for (const side of [-1, 1]) {
              box(
                [1.35, 1.3, 0.035],
                [x + a + 1.0, 3.3, z + side * (d / 2 + 0.025)],
                "#446a70",
              );
              box(
                [1.42, 0.08, 0.1],
                [x + a + 1, 2.65, z + side * (d / 2 + 0.07)],
                "#e0d1b6",
              );
            }
        }
      } else {
        for (let a = -d / 2 + 2; a < d / 2; a += 4) {
          box(
            [w + 0.06, h - 0.25, 0.12],
            [x, (h - 0.25) / 2, z + a],
            "#b0b2a1",
          );
          if (h >= 5 && d > 8)
            for (const side of [-1, 1]) {
              box(
                [0.035, 1.3, 1.35],
                [x + side * (w / 2 + 0.025), 3.3, z + a + 1],
                "#446a70",
              );
              box(
                [0.1, 0.08, 1.42],
                [x + side * (w / 2 + 0.07), 2.65, z + a + 1],
                "#e0d1b6",
              );
            }
        }
      }
    } else {
      for (const side of [-1, 1]) {
        box(
          [w - 0.25, h - 0.3, 0.045],
          [x, h / 2, z + side * (d / 2 + 0.025)],
          "#294b50",
        );
        box(
          [w - 0.5, 0.065, 0.055],
          [x, 0.3, z + side * (d / 2 + 0.04)],
          "#8ed6c7",
        );
        for (const offset of [-0.3, 0.3])
          box(
            [0.06, h - 0.28, 0.07],
            [x + offset * w, h / 2, z + side * (d / 2 + 0.06)],
            "#83a69c",
          );
      }
      box(
        [0.14, h + 0.1, 0.14],
        [x - w / 2 + 0.08, h / 2, z - d / 2 + 0.08],
        "#b3b7a5",
      );
      box(
        [0.14, h + 0.1, 0.14],
        [x + w / 2 - 0.08, h / 2, z + d / 2 - 0.08],
        "#b3b7a5",
      );
    }
  }
  for (const site of map.sites) {
    const color = site.name === "A" ? "#d6ae69" : "#73bcb3";
    for (const side of [-1, 1]) {
      box([8, 0.012, 0.09], [site.x, 0.015, site.z + side * 4], color);
      box([0.09, 0.012, 8], [site.x + side * 4, 0.015, site.z], color);
    }
    const floorSign = sign(
      scene,
      site.name,
      [site.x, 0.025, site.z],
      2.1,
      color,
    );
    floorSign.rotation.x = -Math.PI / 2;
    sign(
      scene,
      site.name,
      [site.x, 3.5, -29.44],
      2.4,
      "#ecdfba",
      site.name === "A" ? "#aa6850" : "#447a79",
    );
    sign(
      scene,
      site.name === "A" ? "REACTOR" : "RESEARCH",
      [site.x, 1.65, -29.43],
      0.5,
      "#e9ddc8",
    );
  }
  // Building shells stay behind boundary colliders; decorative panels stay on their surfaces.
  for (let i = 0; i < 11; i++) {
    const x = -43 + i * 8,
      h = 8 + ((i * 7) % 5) * 2,
      z = -37 - (i % 3) * 3,
      color = i % 3 === 0 ? "#b67c62" : i % 3 === 1 ? "#d3c1a3" : "#6b9291";
    box([7, h, 8], [x, h / 2, z], color);
    box([7.4, 0.35, 8.4], [x, h, z], "#d7c6aa");
    for (let yy = 3; yy < h - 1; yy += 3)
      for (const xx of [-2, 0, 2]) {
        box([0.9, 1.4, 0.05], [x + xx, yy, z + 4.03], "#3c626c");
        box([1.15, 0.09, 0.18], [x + xx, yy - 0.75, z + 4.08], "#e0d1b6");
      }
    box([1.4, 0.8, 1.8], [x + 1, h + 0.4, z], "#819996");
  }
  for (const [x, z, rot] of [
    [-29.44, 15, Math.PI / 2],
    [29.44, 15, -Math.PI / 2],
    [0, 29.44, Math.PI],
  ]) {
    const door = new THREE.Group();
    door.position.set(x, 0, z);
    door.rotation.y = rot;
    scene.add(door);
    roundBlock(door, [2.8, 3.8, 0.08], [0, 1.9, 0], "#335f66", 0.04);
    for (const dx of [-1.5, 1.5])
      block(door, [0.18, 4, 0.15], [dx, 2, 0.08], "#c8bdab");
    block(door, [3.2, 0.2, 0.25], [0, 4, 0.08], "#c8bdab");
    block(door, [0.06, 3.5, 0.025], [0, 1.8, 0.06], "#75a99c");
    sign(door, "45", [0, 2.8, 0.07], 0.6, "#c8ddce");
    sign(door, "AUTHORIZED", [0, 1.2, 0.07], 0.25, "#c8ddce");
  }
  sign(scene, "BREAKWATER", [0, 4.6, -29.43], 1.9, "#d6dfcc", "#365b62");
  sign(
    scene,
    "A  ←    MID    →  B",
    [0, 2.0, 13.53],
    0.65,
    "#e4e1c8",
    "#386b6c",
  );
  for (const x of [-28.9, 28.9])
    for (const z of [-22, -5, 12, 25]) {
      box([0.11, 4.4, 0.11], [x, 2.2, z], "#385662");
      box([1.0, 0.1, 0.22], [x, 4.35, z], "#d7cda9");
    }
  // A distant crane, water tanks and vegetation give the skyline a coastal silhouette.
  box([0.7, 16, 0.7], [-38, 8, 8], "#aa7656");
  box([20, 0.6, 0.6], [-32, 16, 8], "#aa7656");
  box([0.05, 9, 0.05], [-24, 11.5, 8], "#384e58");
  for (const x of [-28.8, 28.8])
    for (const z of [-26, -10, 20]) {
      box([0.8, 0.6, 0.8], [x, 0.3, z], "#a9987d");
      tube(scene, 0.06, 0.1, 2.3, [x, 1.5, z], "#7a6e53");
      for (let i = 0; i < 5; i++) {
        const leaf = ellipsoid(
          scene,
          [0.12, 0.07, 1.05],
          [x, 2.65, z],
          "#4f7c68",
        );
        leaf.rotation.y = i * Math.PI * 0.4;
        leaf.rotation.x = 0.2;
      }
    }
  const dummy = new THREE.Object3D();
  let instances = 0;
  for (const { mat, items } of batches.values()) {
    const batch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      mat,
      items.length,
    );
    items.forEach(({ size, pos, rotation }, i) => {
      dummy.position.set(...pos);
      dummy.scale.set(...size);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      batch.setMatrixAt(i, dummy.matrix);
    });
    batch.castShadow = true;
    batch.receiveShadow = true;
    scene.add(batch);
    instances += items.length;
  }
  return { instances, materialBatches: batches.size };
}
