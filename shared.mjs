export const CORE_BLAST = { radius: 16, damage: 500 };
export const ARMOR = {
  lightArmor: { name: "경형 보호막", cost: 400, armor: 25 },
  armor: { name: "중형 보호막", cost: 1000, armor: 50 },
};
export const MAP = {
  name: "해안 연구소 · BREAKWATER",
  size: 30,
  buyLine: 18,
  orbs: [
    { id: "west", x: -18, z: 8 },
    { id: "east", x: 18, z: 8 },
  ],
  sites: [
    { name: "A", x: -19, z: -16 },
    { name: "B", x: 19, z: -16 },
  ],
  walls: [
    [-30, 0, 1, 60, 6],
    [30, 0, 1, 60, 6],
    [0, -30, 60, 1, 6],
    [0, 30, 60, 1, 6],
    [-11, 17, 3, 18, 5],
    [11, 17, 3, 18, 5],
    [-11, -14, 3, 20, 5],
    [11, -14, 3, 20, 5],
    [-21, 3, 10, 3, 5],
    [21, 3, 10, 3, 5],
    [0, -5, 8, 3, 5],
    [0, 12, 7, 3, 3],
    [-22, -17, 4, 4, 2.5],
    [22, -17, 4, 4, 2.5],
    [-4, -21, 8, 5, 4],
    [5, 22, 3, 3, 2],
    [-22, 15, 4, 4, 2.5],
    [22, 15, 4, 4, 2.5],
  ],
};
export const WEAPONS = {
  knife: {
    backstabScale: 2,
    alternate: {
      pellets: 1,
      rate: 1,
      spread: 0,
      damage: 75,
      head: 100,
      range: 2,
    },
    moveSpeed: 6.5,
    equip: 0.3,
    fireMode: "auto",
    name: "전술 나이프",
    cost: 0,
    damage: 50,
    head: 75,
    rate: 0.5,
    mag: 1,
    reserve: 0,
    reload: 0,
    spread: 0,
    range: 2.4,
    penetration: 0,
    legScale: 1,
  },
  pistol: {
    moveSpeed: 5.6,
    alternate: { pellets: 3, rate: 0.55, spread: 0.095 },
    equip: 0.4,
    fireMode: "semi",
    name: "클래식",
    cost: 0,
    damage: 26,
    head: 78,
    rate: 0.24,
    mag: 12,
    reserve: 48,
    reload: 1.5,
    spread: 0.012,
    penetration: 0.8,
    falloff: [
      [30, 1],
      [150, 0.85],
    ],
  },
  rifle: {
    moveSpeed: 5.4,
    aimMoveScale: 0.76,
    canAim: true,
    equip: 0.75,
    fireMode: "auto",
    name: "레이븐",
    cost: 2900,
    damage: 40,
    head: 150,
    rate: 0.105,
    mag: 25,
    reserve: 75,
    reload: 2.3,
    spread: 0.008,
    penetration: 2.5,
  },
  smg: {
    moveSpeed: 5.8,
    aimMoveScale: 0.9,
    canAim: true,
    equip: 0.65,
    fireMode: "auto",
    name: "스펙터",
    cost: 1600,
    damage: 26,
    head: 78,
    rate: 0.075,
    mag: 30,
    reserve: 90,
    reload: 1.9,
    spread: 0.022,
    penetration: 1,
    falloff: [
      [20, 1],
      [35, 0.85],
      [150, 0.7],
    ],
  },
  shotgun: {
    name: "브리처",
    cost: 1100,
    moveSpeed: 5.4,
    equip: 0.8,
    fireMode: "semi",
    damage: 12,
    head: 24,
    pellets: 10,
    rate: 0.85,
    mag: 6,
    reserve: 24,
    reload: 2.6,
    spread: 0.1,
    penetration: 0,
    range: 35,
    falloff: [
      [8, 1],
      [16, 0.65],
      [35, 0.3],
    ],
  },
  burstRifle: {
    name: "트라이어드",
    cost: 2050,
    moveSpeed: 5.4,
    equip: 0.75,
    canAim: true,
    aimMoveScale: 0.8,
    fireMode: "semi",
    burstCount: 3,
    burstSpacing: 0.08,
    damage: 32,
    head: 96,
    rate: 0.5,
    mag: 24,
    reserve: 72,
    reload: 2.4,
    spread: 0.013,
    penetration: 1.5,
  },
  sniper: {
    moveSpeed: 5.13,
    aimMoveScale: 0.72,
    canAim: true,
    equip: 1,
    fireMode: "semi",
    name: "오라클",
    cost: 4700,
    damage: 150,
    head: 255,
    rate: 1.25,
    mag: 5,
    reserve: 15,
    reload: 3,
    spread: 0.001,
    penetration: 5,
    legScale: 0.8,
  },
};
export const AGENTS = {
  haven: {
    name: "헤이븐",
    role: "지원가",
    color: "#8ce2bd",
    skill: "회복 광선",
    description:
      "15m 안의 조준 방향 아군 체력 60 회복 · 대상이 없으면 자신 회복",
    key: "Q",
    secondary: {
      name: "보호막 보충",
      cost: 250,
      max: 2,
      description: "자신의 방어력 25 회복 · 최대 50",
    },
    ultimate: {
      name: "회복 파동",
      points: 7,
      description: "20m 안의 시야에 닿는 아군 체력 완전 회복",
    },
  },
  veil: {
    name: "베일",
    role: "전략가",
    color: "#8fa5ff",
    skill: "연막",
    key: "Q",
    secondary: {
      name: "섬광 파동",
      cost: 250,
      max: 2,
      description: "전방 14m의 시야를 2초 방해 · 벽에 차단",
    },
    ultimate: {
      name: "그림자 이동",
      points: 6,
      description: "조준 방향으로 최대 14m 이동 · 벽 관통 불가",
    },
  },
  pulse: {
    name: "펄스",
    role: "척후대",
    color: "#70e2cf",
    skill: "정찰",
    key: "Q",
    secondary: {
      name: "충격 파동",
      cost: 300,
      max: 2,
      description: "전방 16m에 충격파 · 방어력 적용 피해 45",
    },
    ultimate: {
      name: "전장 스캔",
      points: 7,
      description: "모든 적의 위치를 8초 동안 공개",
    },
  },
  dash: {
    name: "제트스트림",
    role: "타격대",
    color: "#ffc783",
    skill: "돌진",
    key: "Q",
    secondary: {
      name: "상승 기류",
      cost: 200,
      max: 2,
      description: "위로 도약 · 공중에서도 사용 가능",
    },
    ultimate: {
      name: "폭풍 집중",
      points: 7,
      description: "12초 공중·이동 탄퍼짐 억제, 돌진 2회 충전",
    },
  },
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function buyBarrier(p) {
  p.z =
    p.team === 0
      ? Math.max(MAP.buyLine + 0.38, p.z)
      : Math.min(-MAP.buyLine - 0.38, p.z);
}
export function blocked(x, z, r = 0.38) {
  return MAP.walls.some(
    ([cx, cz, w, d]) =>
      Math.abs(x - cx) < w / 2 + r && Math.abs(z - cz) < d / 2 + r,
  );
}
export function movementSpeed(p, input) {
  const weapon = WEAPONS[p.weapon];
  const stance = input.crouch ? 2 / 5.6 : input.walk ? 2.5 / 5.6 : 1;
  const aim = input.ads && weapon?.canAim ? weapon.aimMoveScale : 1;
  return (weapon?.moveSpeed ?? 5.6) * stance * aim * (p.slow > 0 ? 0.5 : 1);
}
export function move(p, input, dt, speed = movementSpeed(p, input)) {
  let f = (input.w ? 1 : 0) - (input.s ? 1 : 0),
    s = (input.d ? 1 : 0) - (input.a ? 1 : 0),
    n = Math.hypot(f, s) || 1;
  let dx = ((-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * speed * dt) / n,
    dz = ((-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * speed * dt) / n;
  if (!blocked(p.x + dx, p.z)) p.x += dx;
  if (!blocked(p.x, p.z + dz)) p.z += dz;
}
export function rayBox(o, d, min, max) {
  let near = 0,
    far = 150;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < min[i] || o[i] > max[i]) return Infinity;
    } else {
      let a = (min[i] - o[i]) / d[i],
        b = (max[i] - o[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (near > far) return Infinity;
    }
  }
  return near;
}
export function wallDistance(o, d) {
  let best = 150;
  for (const [x, z, w, l, h] of MAP.walls)
    best = Math.min(
      best,
      rayBox(o, d, [x - w / 2, 0, z - l / 2], [x + w / 2, h, z + l / 2]),
    );
  return best;
}
// Local-space hit regions follow the procedural model. Weapons, hair and accessories are not hit regions.
export const PLAYER_HITBOXES = [
  { name: "head", min: [-0.15, 1.49, -0.15], max: [0.15, 1.85, 0.15] },
  { name: "body", min: [-0.25, 0.83, -0.18], max: [0.25, 1.49, 0.18] },
  { name: "legs", min: [-0.2, 0, -0.14], max: [0.2, 0.83, 0.14] },
  { name: "arm-left", min: [-0.33, 1.03, -0.2], max: [-0.24, 1.42, 0.12] },
  { name: "arm-right", min: [0.24, 1.03, -0.2], max: [0.33, 1.42, 0.12] },
];
export function rayPlayer(origin, direction, pose) {
  const c = Math.cos(pose.yaw || 0),
    s = Math.sin(pose.yaw || 0),
    dx = origin[0] - pose.x,
    dz = origin[2] - pose.z;
  const o = [dx * c - dz * s, origin[1] - pose.y, dx * s + dz * c];
  const d = [
    direction[0] * c - direction[2] * s,
    direction[1],
    direction[0] * s + direction[2] * c,
  ];
  const scale = pose.crouch ? 0.73 : 1;
  let result = { distance: Infinity, head: false, region: null };
  for (const box of PLAYER_HITBOXES) {
    const min = [box.min[0], box.min[1] * scale, box.min[2]],
      max = [box.max[0], box.max[1] * scale, box.max[2]],
      t = rayBox(o, d, min, max);
    if (t < result.distance)
      result = { distance: t, head: box.name === "head", region: box.name };
  }
  return result;
}
export const direction = (yaw, pitch) => [
  -Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  -Math.cos(yaw) * Math.cos(pitch),
];

// Shared server/HUD tuning; values are independently designed, not extracted data.
export function shotProfile(weapon, player, time) {
  const w = WEAPONS[weapon];
  const heat =
    player.recoilWeapon === weapon
      ? Math.max(
          0,
          Math.min(12, player.burst || 0) -
            Math.max(0, time - player.lastShot - 0.15) * 18,
        )
      : 0;
  const input = player.input || {};
  const aiming = input.ads && w.canAim;
  const moving = !!input.w !== !!input.s || !!input.a !== !!input.d;
  const movement = moving ? (input.walk || input.crouch ? 2 : 5) : 1;
  const spread =
    w.spread *
    movement *
    (player.y > 0.1 ? 4 : 1) *
    (aiming ? 0.65 : 1) *
    (input.crouch ? 0.7 : 1) *
    (1 + 2 * clamp(((player.landingUntil || 0) - time) / 0.18, 0, 1)) *
    (1 + heat * 0.1) *
    (player.focusUntil > time ? 0.5 : 1);
  const rise = { rifle: 0.002, smg: 0.0015, pistol: 0.0008 }[weapon] || 0;
  return {
    heat,
    spread,
    pitch: heat * rise * (aiming ? 0.8 : 1),
    yaw: heat > 5 && rise ? Math.sin((heat - 5) * 0.7) * rise * 2 : 0,
  };
}
