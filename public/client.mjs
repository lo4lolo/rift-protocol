import * as THREE from "three";
import { AssistNotice, ChatComposer } from "/notifications.mjs";
const chatComposer = new ChatComposer();
let chatTimer;
let assistNotice = new AssistNotice();
let chatOpen = false;
import {
  buildWorld,
  createWeapon,
  createAgent,
  animateAgent,
  disposeModel,
  reloadPose,
  animateWeaponReload,
} from "/art.mjs";
import {
  MAP,
  WEAPONS,
  ARMOR,
  AGENTS,
  move,
  clamp,
  buyBarrier,
  shotProfile,
} from "/shared.mjs";
import {
  INPUT_DT,
  INTERPOLATION_DELAY,
  simulateCommand,
  motionState,
  reconcile,
  SnapshotBuffer,
} from "/netcode.mjs";
const snapshots = new SnapshotBuffer();
const lootMeshes = new Map();
const pingMeshes = new Map();
const orbMeshes = new Map();
let pendingInputs = [],
  inputAccumulator = 0,
  snapshotReceivedAt = 0;
const correction = { x: 0, y: 0, z: 0 };
const serverNow = () =>
  state
    ? state.time +
      (performance.now() - snapshotReceivedAt) / 1000 +
      Math.min(latency / 2000, 0.15)
    : 0;
const $ = (id) => document.getElementById(id),
  show = (id, v) => $(id).classList.toggle("hidden", !v);
const preferences = {
  sensitivity: 1,
  volume: 0.7,
  color: "#b2ffe0",
  quality: "high",
};
try {
  const saved = JSON.parse(localStorage.getItem("rift:settings:v1") || "null");
  if (saved) {
    if (Number.isFinite(saved.sensitivity))
      preferences.sensitivity = clamp(saved.sensitivity, 0.2, 3);
    if (Number.isFinite(saved.volume))
      preferences.volume = clamp(saved.volume, 0, 1);
    if (["#b2ffe0", "#ffffff", "#ffeb78", "#ff7de4"].includes(saved.color))
      preferences.color = saved.color;
    if (saved.quality === "low") preferences.quality = "low";
  }
} catch {}
let settingsOpen = false;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $("game"), antialias: true });
} catch {
  $("connection").textContent =
    "WebGL을 사용할 수 없습니다. Chrome 또는 Edge에서 하드웨어 가속을 켜 주세요.";
  throw new Error("WebGL unavailable");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
function applyPreferences() {
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, preferences.quality === "low" ? 1 : 1.6),
  );
  renderer.shadowMap.enabled = preferences.quality === "high";
  document.documentElement.style.setProperty("--crosshair", preferences.color);
  $("sensitivity").value = preferences.sensitivity;
  $("volume").value = preferences.volume;
  $("crosshair-color").value = preferences.color;
  $("quality").value = preferences.quality;
  $("sensitivity-value").textContent = preferences.sensitivity.toFixed(2);
  $("volume-value").textContent = `${Math.round(preferences.volume * 100)}%`;
  try {
    localStorage.setItem("rift:settings:v1", JSON.stringify(preferences));
  } catch {}
}
function toggleSettings(value) {
  settingsOpen = value;
  show("settings", value);
  if (value) document.exitPointerLock?.();
}
$("settings-open").onclick = $("settings-game").onclick = () =>
  toggleSettings(true);
$("settings-close").onclick = () => toggleSettings(false);
for (const key of ["sensitivity", "volume", "crosshair-color", "quality"])
  $(key).addEventListener("input", () => {
    preferences.sensitivity = Number($("sensitivity").value);
    preferences.volume = Number($("volume").value);
    preferences.color = $("crosshair-color").value;
    preferences.quality = $("quality").value;
    applyPreferences();
  });
applyPreferences();
const scene = new THREE.Scene();
scene.background = new THREE.Color("#accbd2");
scene.fog = new THREE.Fog("#b6cbd0", 35, 105);
const camera = new THREE.PerspectiveCamera(
  78,
  innerWidth / innerHeight,
  0.05,
  160,
);
camera.rotation.order = "YXZ";
scene.add(camera);
scene.add(new THREE.HemisphereLight("#d9f8ff", "#6e736c", 1.5));
const sun = new THREE.DirectionalLight("#fff1d2", 2.5);
sun.position.set(-25, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -40,
  right: 40,
  top: 40,
  bottom: -40,
  near: 1,
  far: 110,
});
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.025;
scene.add(sun);
const mats = new Map();
function material(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!mats.has(key))
    mats.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }),
    );
  return mats.get(key);
}
function box(w, h, d, x, y, z, color, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const worldArt = buildWorld(scene, MAP);
const barriers = new THREE.Group();
const barrierCanvas = document.createElement("canvas");
barrierCanvas.width = barrierCanvas.height = 128;
const barrierPaint = barrierCanvas.getContext("2d");
barrierPaint.fillStyle = "rgba(50,170,195,0.18)";
barrierPaint.fillRect(0, 0, 128, 128);
barrierPaint.strokeStyle = "rgba(150,245,255,0.8)";
barrierPaint.lineWidth = 3;
for (let offset = -128; offset <= 128; offset += 64) {
  barrierPaint.beginPath();
  barrierPaint.moveTo(offset, 0);
  barrierPaint.lineTo(offset + 128, 128);
  barrierPaint.stroke();
}
const barrierTexture = new THREE.CanvasTexture(barrierCanvas);
barrierTexture.wrapS = barrierTexture.wrapT = THREE.RepeatWrapping;
barrierTexture.repeat.set(30, 3.5);
for (const z of [-MAP.buyLine, MAP.buyLine]) {
  const gate = new THREE.Mesh(
    new THREE.PlaneGeometry(59, 7),
    new THREE.MeshBasicMaterial({
      color: "#65d7e5",
      map: barrierTexture,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  gate.position.set(0, 3.5, z);
  barriers.add(gate);
}
barriers.visible = false;
scene.add(barriers);
const gun = new THREE.Group();
const weaponScene = new THREE.Scene();
const weaponCamera = new THREE.PerspectiveCamera(
  68,
  innerWidth / innerHeight,
  0.025,
  10,
);
weaponScene.add(
  weaponCamera,
  new THREE.HemisphereLight("#d6e9ec", "#59676e", 2),
);
const weaponLight = new THREE.DirectionalLight("#fff0d7", 2.2);
weaponLight.position.set(-3, 5, 4);
weaponScene.add(weaponLight);
weaponCamera.add(gun);
gun.position.set(0.28, -0.28, -0.5);
gun.scale.setScalar(0.72);
function buildGun(type) {
  for (const child of [...gun.children]) disposeModel(child);
  gun.add(createWeapon(type, { view: true }));
}
buildGun("pistol");
gun.visible = false;
let selected = "veil",
  ws,
  id = null,
  state = null,
  local = null,
  yaw = 0,
  pitch = 0,
  seq = 0,
  lastEvent = 0,
  joined = false,
  locked = false,
  shop = false,
  lastHealth = 100,
  hitUntil = 0,
  hitInfoUntil = 0,
  damageUntil = 0,
  recoil = 0,
  flashUntil = 0,
  latency = 0,
  frameCount = 0,
  fps = 60,
  lastFps = performance.now(),
  lastWeapon = "pistol",
  lastRound = 0;
const keys = {},
  avatars = new Map(),
  smokeMeshes = [],
  effects = [];
let eventLog = [];
let audioContext;
function sound(
  freq = 240,
  duration = 0.07,
  volume = 0.025,
  type = "triangle",
  pan = 0,
) {
  if (preferences.volume === 0) return;
  try {
    audioContext ??= new AudioContext();
    const osc = audioContext.createOscillator(),
      gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(30, freq * 0.3),
      audioContext.currentTime + duration,
    );
    gain.gain.setValueAtTime(
      Math.max(0.00001, volume * preferences.volume),
      audioContext.currentTime,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + duration,
    );
    osc.connect(gain);
    const stereo = audioContext.createStereoPanner();
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    gain.connect(stereo);
    stereo.connect(audioContext.destination);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
    osc.start();
    osc.stop(audioContext.currentTime + duration);
  } catch {}
}
for (const [k, a] of Object.entries(AGENTS)) {
  const b = document.createElement("button");
  b.className = "agent" + (k === selected ? " selected" : "");
  b.title = `Q ${a.skill}${a.description ? ": " + a.description : ""} · C ${a.secondary.name}: ${a.secondary.description} · V ${a.ultimate.name}: ${a.ultimate.description}`;
  b.innerHTML = `<span class="sigil" style="color:${a.color}">${k === "veil" ? "◈" : k === "pulse" ? "⌁" : k === "haven" ? "◉" : "ϟ"}</span>${a.name}<small>${a.role} · ${a.skill}</small>`;
  b.onclick = () => {
    selected = k;
    document
      .querySelectorAll(".agent")
      .forEach((x) => x.classList.remove("selected"));
    b.classList.add("selected");
  };
  $("agents").append(b);
}
function send(m) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(m));
}
let reconnectUntil = 0,
  reconnectTimer = null;
function sessionKey() {
  return `rift:session:${$("code").value.trim().toUpperCase()}`;
}
function savedResumeToken() {
  try {
    return sessionStorage.getItem(sessionKey()) || undefined;
  } catch {
    return undefined;
  }
}
$("join").onclick = () => {
  clearTimeout(reconnectTimer);
  if (ws && ws.readyState < 2) return;
  $("connection").textContent = "작전 서버에 연결 중…";
  $("join").disabled = true;
  ws = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`,
  );
  const connection = ws;
  ws.onopen = () =>
    send({
      type: "join",
      code: $("code").value.trim().toUpperCase(),
      name: $("name").value.trim(),
      agent: selected,
      resumeToken: savedResumeToken(),
    });
  ws.onmessage = (e) => {
    if (ws !== connection) return;
    const m = JSON.parse(e.data);
    if (m.type === "chatAck") {
      const result = chatComposer.acknowledge(m.requestId, m.accepted === true);
      if (result) {
        clearTimeout(chatTimer);
        $("chat-status").textContent = result.accepted
          ? "전송했습니다."
          : "전송하지 못했습니다. 1초 뒤 다시 보내 주세요.";
        if (result.accepted && $("chat-input").value.trim() === result.text) {
          $("chat-input").value = "";
          closeChat();
        }
      }
    }
    if (m.type === "error") {
      if (m.reason === "resume_expired") {
        try {
          sessionStorage.removeItem(sessionKey());
        } catch {}
      }
      if (!m.reason?.startsWith("resume_")) reconnectUntil = 0;
      $("connection").textContent = m.message;
      ws.close();
    }
    if (m.type === "welcome") {
      if (!m.resumed) {
        closeChat();
        $("chat-messages").replaceChildren();
        $("team-chat").hidden = true;
      }
      reconnectUntil = 0;
      clearTimeout(reconnectTimer);
      seq = m.seq || 0;
      try {
        sessionStorage.setItem(sessionKey(), m.resumeToken);
      } catch {}
      snapshots.clear();
      pendingInputs = [];
      inputAccumulator = 0;
      lastEvent = 0;
      assistNotice = new AssistNotice();
      eventLog = [];
      lastRound = 0;
      id = m.id;
      joined = true;
      show("menu", false);
      show("lobby", true);
      document.querySelector(".grain").style.display = "none";
      $("roomlabel").textContent =
        `방 코드 ${m.code} · ${m.resumed ? "기존 경기로 복귀했습니다." : "친구에게 이 주소와 코드를 알려 주세요."}`;
    }
    if (m.type === "state") receive(m.state);
    if (m.type === "pong") latency = Math.round(performance.now() - m.stamp);
  };
  ws.onerror = () => {
    $("connection").textContent =
      "연결 실패: 시작하기.cmd로 서버를 실행했는지 확인하세요.";
  };
  ws.onclose = () => {
    if (ws !== connection) return;
    const wasJoined = joined;
    joined = false;
    state = null;
    local = null;
    shop = false;
    settingsOpen = false;
    show("settings", false);
    document.exitPointerLock?.();
    $("join").disabled = false;
    if (wasJoined) {
      reconnectUntil = Date.now() + 30000;
      show("menu", true);
      show("lobby", false);
      show("hud", false);
      show("shop", false);
      show("match-result", false);
      $("connection").textContent =
        "연결이 끊어졌습니다. 30초 동안 기존 경기 복귀를 시도합니다.";
      document.querySelector(".grain").style.display = "";
    }
    if (Date.now() < reconnectUntil) {
      reconnectTimer = setTimeout(() => $("join").onclick(), 2000);
    }
  };
};
$("bots").onclick = () => send({ type: "bots" });
$("start").onclick = () => send({ type: "start" });
$("team-atk").onclick = () => send({ type: "team", team: 0 });
$("team-def").onclick = () => send({ type: "team", team: 1 });
$("remove-bots").onclick = () => send({ type: "removeBots" });
$("overtime").onchange = (e) =>
  send({ type: "configure", overtime: e.target.checked });
$("rematch").onclick = () => send({ type: "start" });
$("back-lobby").onclick = () => send({ type: "lobby" });
function avatar(p) {
  const group = createAgent(p);
  scene.add(group);
  return group;
}
function receive(s) {
  state = s;
  snapshotReceivedAt = performance.now();
  snapshots.push(s);
  const p = s.players.find((p) => p.id === id);
  if (!p) return;
  const changed = s.round !== lastRound;
  if (!local || changed) {
    local = motionState(p);
    pendingInputs = [];
    correction.x = correction.y = correction.z = 0;
    yaw = p.yaw;
    pitch = p.pitch;
    lastRound = s.round;
  } else {
    const result = reconcile(
      p,
      ["buy", "live", "end"].includes(s.phase) ? pendingInputs : [],
      s.phase,
    );
    const distance = Math.hypot(
      local.x - result.predicted.x,
      local.z - result.predicted.z,
    );
    if (distance < 2 && p.alive) {
      correction.x += local.x - result.predicted.x;
      correction.y += local.y - result.predicted.y;
      correction.z += local.z - result.predicted.z;
    } else correction.x = correction.y = correction.z = 0;
    local = result.predicted;
    pendingInputs = result.pending;
  }
  if (p.hp < lastHealth) {
    damageUntil = performance.now() + 250;
    sound(90, 0.12, 0.04, "sawtooth");
  }
  lastHealth = p.hp;
  if (!p.alive && document.pointerLockElement) document.exitPointerLock();
  if (p.weapon !== lastWeapon) {
    buildGun(p.weapon);
    lastWeapon = p.weapon;
  }
  const lobby = s.phase === "lobby";
  show("lobby", lobby);
  show("hud", !lobby);
  show("match-result", s.phase === "match");
  if (s.phase === "match") {
    if (document.pointerLockElement) document.exitPointerLock();
    $("match-title").textContent =
      s.winner === p.team ? "작전 승리" : "작전 패배";
    $("match-score").textContent =
      `우리 팀 ${s.score[p.team]} : ${s.score[1 - p.team]} 상대 팀 · ${s.round} 라운드`;
    $("rematch").disabled = s.owner !== id;
    $("back-lobby").disabled = s.owner !== id;
    $("match-help").textContent =
      s.owner === id
        ? "다시 시작하거나 작전실에서 팀과 연장전 설정을 바꾸세요."
        : "방장이 다음 작전을 준비하고 있습니다.";
  }
  if (lobby) {
    $("roster").replaceChildren();
    for (const q of s.players) {
      let row = document.createElement("div");
      row.className = "roster-row" + (q.team ? " enemy" : "");
      row.textContent = `${q.team ? "수비" : "공격"} · ${q.name} / ${AGENTS[q.agent].name}${q.id === s.owner ? " ★" : ""}${q.connected === false ? " · 연결 대기" : ""}`;
      $("roster").append(row);
    }
    $("bots").disabled = s.owner !== id || s.players.length === 10;
    $("start").disabled = s.owner !== id;
    $("team-atk").disabled =
      p.team === 0 || s.players.filter((q) => q.team === 0).length >= 5;
    $("team-def").disabled =
      p.team === 1 || s.players.filter((q) => q.team === 1).length >= 5;
    $("remove-bots").disabled = s.owner !== id || !s.players.some((q) => q.bot);
    $("overtime").checked = s.overtime;
    $("overtime").disabled = s.owner !== id;
  } else if (s.phase !== "buy" && shop) toggleShop(false);
  for (const q of s.players) {
    if (q.id === id) continue;
    const existing = avatars.get(q.id);
    if (q.visible === false) {
      if (existing) {
        existing.visible = false;
        existing.userData.target = q;
      }
      continue;
    }
    if (
      existing &&
      (existing.userData.team !== q.team || existing.userData.agent !== q.agent)
    ) {
      disposeModel(existing);
      avatars.delete(q.id);
    }
    if (!avatars.has(q.id)) avatars.set(q.id, avatar(q));
    const g = avatars.get(q.id);
    g.userData.target = q;
    g.visible = q.alive;
    g.scale.y = q.crouch ? 0.73 : 1;
  }
  for (const [key, g] of avatars)
    if (!s.players.some((q) => q.id === key)) {
      scene.remove(g);
      g.traverse((c) => c.geometry?.dispose());
      avatars.delete(key);
    }
  for (const e of s.events) {
    if (e.id <= lastEvent) continue;
    lastEvent = e.id;
    eventLog.push(e);
    eventLog = eventLog.slice(-60);
    if (e.type === "chat") {
      $("team-chat").hidden = false;
      const line = document.createElement("div");
      line.textContent = `[팀] ${e.name}: ${e.text}`;
      $("chat-messages").append(line);
      while ($("chat-messages").children.length > 8)
        $("chat-messages").firstChild.remove();
    }
    if (e.type === "sound") {
      if (e.kind === "melee")
        sound(180, 0.08, 0.004 * e.level, "triangle", e.pan);
      else if (e.kind === "shot")
        sound(125, 0.06, 0.007 * e.level, "sawtooth", e.pan);
      else
        sound(
          e.kind === "land" ? 48 : 65,
          e.kind === "land" ? 0.1 : 0.045,
          0.006 * e.level,
          "sine",
          e.pan,
        );
    }
    if (e.type === "shot") {
      const melee = e.weapon === "knife";
      if (e.player === id) {
        recoil = melee && e.alternate ? 0.18 : 0.09;
        if (!melee) flashUntil = performance.now() + 45;
        if (!e.pellet)
          sound(
            melee ? 180 : e.weapon === "sniper" ? 80 : 150,
            0.09,
            melee ? 0.015 : 0.045,
            melee ? "triangle" : "sawtooth",
          );
        if (e.hit) {
          hitUntil = performance.now() + 150;
          hitInfoUntil = performance.now() + 900;
          $("hit-info").textContent =
            `${e.backstab ? "뒤쪽 공격 · " : ""}${e.head ? "머리" : e.region === "legs" ? "다리" : "몸통"} 명중${e.penetrated ? " · 엄폐물 관통" : ""}`;
          sound(e.head ? 1100 : 700, 0.07, 0.04);
        }
      } else {
        const actor = avatars.get(e.player);
        if (actor && !melee) actor.userData.flashUntil = performance.now() + 60;
        const distance = Math.hypot(e.from[0] - p.x, e.from[2] - p.z);
        const radius = melee ? 8 : 40;
        if (distance < radius && !e.pellet)
          sound(
            melee ? 180 : 125,
            0.06,
            0.028 * (1 - distance / radius),
            melee ? "triangle" : "sawtooth",
          );
      }
      if (melee) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(
        e.from.map
          ? [new THREE.Vector3(...e.from), new THREE.Vector3(...e.to)]
          : [],
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: "#ffe4aa",
          transparent: true,
          opacity: 0.65,
        }),
      );
      scene.add(line);
      effects.push({ mesh: line, end: performance.now() + 70 });
    }
    if (e.type === "skill") {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8, e.slot === "ultimate" ? 3 : 1.3, 48),
        new THREE.MeshBasicMaterial({
          color: AGENTS[e.agent].color,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x, 0.08, e.z);
      scene.add(ring);
      effects.push({ mesh: ring, end: performance.now() + 700 });
      if (e.player === id) sound(e.slot === "ultimate" ? 280 : 640, 0.22, 0.04);
    }
    if (e.type === "plant") sound(600, 0.3, 0.04);
    if (e.type === "detonate" && s.time - e.time < 1) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 12),
        new THREE.MeshBasicMaterial({
          color: "#70dfd2",
          transparent: true,
          opacity: 0.3,
          wireframe: true,
          depthWrite: false,
        }),
      );
      mesh.position.set(e.x, 0, e.z);
      mesh.scale.setScalar(0.01);
      scene.add(mesh);
      const start = performance.now();
      effects.push({ mesh, start, end: start + 800, radius: e.radius });
      sound(45, 0.5, 0.05, "sine");
    }
    if (e.type === "result") sound(330, 0.6, 0.04);
  }
  $("feed").replaceChildren();
  for (const e of eventLog
    .filter((e) => e.type === "kill" && state.time - e.time < 8)
    .slice(-5)) {
    const row = document.createElement("div");
    row.textContent = `${e.killer}  ${e.head ? "◇" : "—"}  ${e.victim}`;
    $("feed").append(row);
  }
  updateHUD(p);
}
let reportKey = "";
function updateHUD(p) {
  const notice = assistNotice.update(state, id);
  show("assist-notice", !!notice);
  if (notice)
    $("assist-notice").textContent =
      `처치 도움 · ${notice.victim} · ${notice.damage && notice.utility ? "피해 + 능력" : notice.damage ? "피해 기여" : "능력 기여"}`;
  const report = p.combatReport;
  show("combat-report", Array.isArray(report));
  const key = JSON.stringify(report);
  if (key !== reportKey) {
    reportKey = key;
    const panel = $("combat-report");
    panel.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = "전투 보고서 · 이번 라운드";
    panel.append(title);
    for (const row of report || []) {
      const line = document.createElement("p");
      const zone =
        {
          head: "머리",
          body: "몸",
          legs: "다리",
          arms: "팔",
          ability: "능력",
          environment: "폭발",
        }[row.region] || row.region;
      line.textContent = `${row.direction === "out" ? "준 피해" : "받은 피해"} · ${row.name} · ${WEAPONS[row.weapon]?.name || row.weapon} · ${zone} ${row.hits}회 · 체력 ${Math.round(row.health)} / 방어 ${Math.round(row.armor)}`;
      panel.append(line);
    }
    if (report?.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "기록된 피해가 없습니다.";
      panel.append(empty);
    }
  }
  $("atk").textContent = state.score[0];
  $("def").textContent = state.score[1];
  $("round").textContent = `ROUND ${String(state.round).padStart(2, "0")}`;
  if (state.overtime && state.round >= 25)
    $("round").textContent = `OVERTIME ${state.round - 24}`;
  const secs = Math.max(0, Math.ceil(state.end - state.time));
  $("timer").textContent =
    `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  $("phase").textContent =
    {
      buy: "구매 단계",
      live: state.spike?.planted ? "코어 가동 중" : "작전 진행",
      end: "라운드 종료",
      match: "작전 종료",
    }[state.phase] || "";
  $("team-label").textContent = `${p.team ? "수비" : "공격"} · ${state.code}`;
  $("health").innerHTML = `${Math.ceil(p.hp)} <em>▱ ${Math.ceil(p.armor)}</em>`;
  $("ammo").innerHTML = `${p.ammo} <em>/ ${p.reserve}</em>`;
  $("weapon").textContent =
    WEAPONS[p.weapon].name +
    (p.equipUntil > state.time
      ? " · 장착 중"
      : p.reloadUntil
        ? " · 재장전 중"
        : "");
  $("agent-name").textContent = AGENTS[p.agent].name;
  $("ability").textContent =
    `Q · ${AGENTS[p.agent].skill} ${p.skill ? `${p.skill}회 준비` : "사용 완료"}`;
  $("secondary").textContent =
    `C · ${AGENTS[p.agent].secondary.name} ${p.secondary}`;
  $("ultimate").title =
    `${AGENTS[p.agent].ultimate.description} · 처치/사망/설치/해체/구체 수집마다 1점, 공수 교대 시 초기화`;
  $("ultimate").textContent =
    `V · ${AGENTS[p.agent].ultimate.name} ${p.ultimate}/${AGENTS[p.agent].ultimate.points}${p.focusUntil > state.time ? " · 발동 중" : ""}`;
  $("blind").style.opacity = p.alive
    ? Math.min(1, Math.max(0, p.blindUntil - state.time))
    : 0;
  $("banner").textContent =
    state.phase === "buy"
      ? "구매 단계"
      : state.phase === "end"
        ? state.winner === p.team
          ? "라운드 승리"
          : "라운드 패배"
        : state.phase === "match"
          ? "작전 종료"
          : "";
  if (
    state.phase === "end" &&
    state.spike?.detonateAt != null &&
    !state.spike.detonated
  )
    $("banner").textContent +=
      ` · 코어 폭발 ${Math.max(0, Math.ceil(state.spike.detonateAt - state.time))}초 · 대피하세요`;
  $("spectate").textContent =
    !p.alive && state.phase !== "lobby"
      ? p.awaitingSpawn
        ? "중간 입장 · 다음 라운드부터 참가합니다"
        : "전투 불능 · 다음 라운드를 기다리는 중"
      : "";
  show("spectator-controls", !p.alive && state.phase !== "match");
  let text =
    state.phase === "buy"
      ? `보유 크레딧 ${p.credits.toLocaleString()} · B를 눌러 무기 구매`
      : state.spike?.planted
        ? state.spike.defuseCheckpoint > 0
          ? "해체 절반 완료 · 가까이에서 F를 길게 눌러 마무리"
          : "코어가 가동 중입니다 · 수비팀은 가까이에서 F를 길게 눌러 해체"
        : state.spike?.carrier === id
          ? "코어 보유 중 · A 또는 B 거점에서 F를 길게 눌러 설치"
          : p.team
            ? "A·B 거점을 지키세요"
            : "팀의 코어 운반자를 엄호하세요";
  if (state.phase === "match")
    text =
      state.owner === id
        ? "Enter를 눌러 새 작전 시작"
        : "방장이 새 작전을 시작할 수 있습니다";
  $("objective").textContent = text;
  if (
    p.alive &&
    state.phase === "live" &&
    !state.spike?.planted &&
    p.ultimate < AGENTS[p.agent].ultimate.points &&
    state.orbs?.some(
      (orb) => orb.available && Math.hypot(orb.x - p.x, orb.z - p.z) < 2,
    )
  )
    $("objective").textContent =
      "F를 3초간 길게 눌러 궁극기 구체 수집 · 움직이거나 공격하면 취소";
  if (state.phase === "buy" && Math.abs(p.z) < MAP.buyLine + 1.5)
    $("objective").textContent =
      "시작 장벽 · 준비 시간이 끝나면 통과할 수 있습니다";
  const nearby = state.drops?.find(
    (d) => Math.hypot(d.x - p.x, d.z - p.z) < 2.3,
  );
  if (nearby && p.alive)
    $("objective").textContent =
      `E · ${WEAPONS[nearby.weapon].name} 획득　|　${text}`;
  $("progress").style.display =
    p.progress > 0 || p.orbProgress > 0 ? "block" : "none";
  $("progress").dataset.mode =
    p.orbProgress > 0 ? "orb" : state.spike?.planted ? "defuse" : "plant";
  $("progress").firstElementChild.style.width =
    `${(p.orbProgress > 0 ? p.orbProgress / 3 : p.progress / (state.spike?.planted ? 7 : 4)) * 100}%`;
  $("scoreboard").replaceChildren();
  for (const q of [...state.players].sort(
    (a, b) => a.team - b.team || b.kills - a.kills,
  )) {
    const row = document.createElement("div");
    const a = document.createElement("span"),
      b = document.createElement("span");
    a.textContent = `${q.team ? "수비" : "공격"}　${q.name}${q.alive ? "" : " †"}`;
    b.textContent = `${q.kills} K / ${q.deaths} D / ${q.assists} A　　${q.credits ?? "—"} ¤`;
    row.append(a, b);
    $("scoreboard").append(row);
  }
  if (shop) renderShop(p);
  const history = document.createElement("section");
  history.className = "round-history";
  const heading = document.createElement("strong");
  heading.textContent = "최근 라운드 · 승패 / 종료 이유";
  history.append(heading);
  const ourTeam = state.teamIds?.[p.team];
  for (const result of (state.roundHistory || []).slice(-12)) {
    const entry = document.createElement("span");
    entry.className = result.winner === ourTeam ? "round-win" : "round-loss";
    entry.textContent = `${result.round}R ${result.winner === ourTeam ? "승" : "패"} · ${result.reason}`;
    history.append(entry);
  }
  $("scoreboard").append(history);
}
let shopKey = "";
function renderShop(p) {
  const nextKey = JSON.stringify([
    id,
    p.credits,
    p.weapon,
    p.primary,
    p.refundableWeapon,
    p.refundableArmor,
    p.refundableSecondary,
    p.armor,
    p.secondary,
    p.agent,
    p.alive,
    state.economy,
    state.players
      .filter((q) => q.team === p.team)
      .map((q) => [q.id, q.name, q.requestedWeapon, q.connected, q.alive]),
  ]);
  if (shopKey === nextKey) return;
  shopKey = nextKey;
  $("money").textContent =
    `보유 크레딧 ${p.credits.toLocaleString()} · 패배 시 기본 보상 ${(state.economy?.nextLossBonus[p.team] ?? 1900).toLocaleString()} · 구매 단계에서만 사용 가능합니다`;
  $("weapons").replaceChildren();
  if (p.refundableWeapon) {
    const refund = document.createElement("button");
    refund.textContent = `${WEAPONS[p.refundableWeapon].name} 구매 취소 · ${WEAPONS[p.refundableWeapon].cost.toLocaleString()} ¤ 환불`;
    refund.onclick = () => send({ type: "refundWeapon" });
    $("weapons").append(refund);
  }
  for (const [key, w] of [
    ...Object.entries(WEAPONS).filter(([key]) => key !== "knife"),
    ...Object.entries(ARMOR),
  ]) {
    const b = document.createElement("button");
    b.innerHTML = `<strong>${w.name}</strong>${w.cost.toLocaleString()} ¤<small>${w.armor ? `방어력 ${w.armor}` : `${w.mag}발 · ${w.burstCount ? `${w.burstCount}점사 · ` : ""}${w.pellets ? `산탄 ${w.pellets}개 · 개당 ` : ""}몸통 ${w.damage} / 머리 ${w.head}`}</small>`;
    b.disabled =
      p.credits < w.cost || key === p.weapon || (w.armor && p.armor >= w.armor);
    b.onclick = () => send({ type: "buy", item: key });
    $("weapons").append(b);
  }
  const secondary = AGENTS[p.agent].secondary;
  const b = document.createElement("button");
  b.dataset.item = "secondary";
  b.innerHTML = `<strong>C · ${secondary.name}</strong>${secondary.cost} ¤<small>${secondary.description}<br>보유 ${p.secondary} / ${secondary.max}</small>`;
  b.disabled = p.credits < secondary.cost || p.secondary >= secondary.max;
  b.onclick = () => send({ type: "buy", item: "secondary" });
  $("weapons").append(b);
  for (const [item, available, label] of [
    ["armor", p.refundableArmor, "보호막 구매 취소"],
    [
      "secondary",
      p.refundableSecondary,
      `C 능력 1회 구매 취소 (이번 구매 ${p.refundableSecondary}회)`,
    ],
  ]) {
    if (!available) continue;
    const refund = document.createElement("button");
    refund.textContent = label;
    refund.onclick = () => send({ type: "refundEquipment", item });
    $("weapons").append(refund);
  }
  $("weapon-requests").replaceChildren();
  for (const key of ["shotgun", "smg", "burstRifle", "rifle", "sniper"]) {
    const request = document.createElement("button");
    request.textContent =
      p.requestedWeapon === key
        ? `${WEAPONS[key].name} 요청 취소`
        : `${WEAPONS[key].name} 요청`;
    request.disabled = !!p.primary || !p.alive;
    request.onclick = () =>
      send({
        type: "requestWeapon",
        item: p.requestedWeapon === key ? null : key,
      });
    $("weapon-requests").append(request);
  }
  $("team-purchases").replaceChildren();
  for (const q of state.players.filter(
    (q) => q.team === p.team && q.id !== id && q.requestedWeapon,
  )) {
    const offer = document.createElement("button"),
      w = WEAPONS[q.requestedWeapon];
    offer.textContent = `${q.name}에게 ${w.name} 구매 · ${w.cost.toLocaleString()} ¤`;
    offer.disabled = !p.alive || !q.connected || !q.alive || p.credits < w.cost;
    offer.onclick = () =>
      send({ type: "sponsorWeapon", target: q.id, item: q.requestedWeapon });
    $("team-purchases").append(offer);
  }
}
function toggleShop(v = !shop) {
  if (v && state?.phase !== "buy") return;
  shop = v;
  show("shop", v);
  if (v) {
    document.exitPointerLock?.();
    renderShop(state.players.find((p) => p.id === id));
  }
}
$("close-shop").onclick = () => toggleShop(false);
$("resume").onclick = () => {
  if (state?.phase === "match") {
    send({ type: "start" });
    return;
  }
  try {
    $("game")
      .requestPointerLock()
      ?.catch(() => {
        $("resume").textContent =
          "마우스 잠금이 제한됩니다. 새 브라우저 창에서 열어 주세요.";
      });
    sound(300, 0.01, 0.001);
  } catch {}
};
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === $("game");
  $("resume").style.display = locked ? "none" : "";
  if (!locked) {
    for (const k in keys) keys[k] = false;
  }
});
addEventListener("mousemove", (e) => {
  if (locked) {
    yaw -= e.movementX * 0.002 * preferences.sensitivity;
    pitch = clamp(
      pitch - e.movementY * 0.002 * preferences.sensitivity,
      -1.45,
      1.45,
    );
  }
});
addEventListener("keydown", (e) => {
  if (chatOpen) {
    if (e.code === "Escape") {
      e.preventDefault();
      closeChat();
    }
    return;
  }
  if (settingsOpen) {
    if (e.code === "Escape") toggleSettings(false);
    return;
  }
  if (joined && e.code === "KeyT" && !e.repeat) {
    e.preventDefault();
    chatOpen = true;
    for (const key in keys) keys[key] = false;
    document.exitPointerLock();
    $("team-chat").hidden = false;
    $("chat-form").hidden = false;
    $("chat-input").focus();
    return;
  }
  if (!joined || state?.phase === "lobby") return;
  if (["Space", "Tab", "KeyW", "KeyA", "KeyS", "KeyD", "KeyF"].includes(e.code))
    e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === "KeyB") toggleShop();
  if (e.code === "Escape" && shop) toggleShop(false);
  if (e.code === "KeyR" && !shop) send({ type: "reload" });
  if (e.code === "KeyG" && !shop) send({ type: "drop" });
  if (e.code === "KeyX" && !shop) send({ type: "dropWeapon" });
  if (e.code === "KeyE" && !shop) send({ type: "pickup" });
  if (!shop && ["Digit1", "Digit2", "Digit3"].includes(e.code))
    send({ type: "select", slot: Number(e.code.slice(-1)) });
  if (e.code === "KeyQ" && !shop) send({ type: "ability" });
  if (e.code === "KeyC" && !shop) send({ type: "ability", slot: "secondary" });
  if (e.code === "KeyV" && !shop) send({ type: "ability", slot: "ultimate" });
  if (e.code === "KeyZ" && locked && !shop && !e.repeat) send({ type: "mark" });
  if (e.code === "Tab") show("scoreboard", true);
  if (e.code === "Enter" && state.phase === "match") send({ type: "start" });
  if (e.code === "BracketLeft") cycleSpectator(-1);
  if (e.code === "BracketRight") cycleSpectator(1);
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "Tab") show("scoreboard", false);
});
addEventListener("mousedown", (e) => {
  if (locked && !shop) {
    if (e.button === 0) {
      keys.fire = true;
      keys.firePressed = true;
    }
    if (e.button === 2) {
      keys.ads = true;
      keys.altPressed = true;
    }
  }
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) keys.fire = false;
  if (e.button === 2) keys.ads = false;
});
addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
});
function closeChat() {
  chatOpen = false;
  $("chat-form").hidden = true;
  $("chat-input").blur();
}
$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const message = chatComposer.begin(
    $("chat-input").value,
    ws?.readyState === 1,
    performance.now(),
  );
  if (!message) {
    if (ws?.readyState !== 1)
      $("chat-status").textContent =
        "서버 연결을 기다려 주세요. 입력은 보관됩니다.";
    return;
  }
  $("chat-status").textContent = "전송 확인 중…";
  send(message);
  chatTimer = setTimeout(() => {
    if (chatComposer.acknowledge(message.requestId, false))
      $("chat-status").textContent =
        "전송 여부를 확인하지 못했습니다. 채팅 내역을 확인한 뒤 다시 시도해 주세요.";
  }, 5000);
});
$("chat-input").addEventListener("compositionstart", () =>
  chatComposer.composition(true, performance.now()),
);
$("chat-input").addEventListener("compositionend", () =>
  chatComposer.composition(false, performance.now()),
);
function input(consumePress = false) {
  const active = locked && !shop && !chatOpen;
  const firePressed = active && !!keys.firePressed;
  const weapon = state?.players.find((p) => p.id === id)?.weapon;
  const altPressed =
    active && !!keys.altPressed && !!WEAPONS[weapon]?.alternate;
  if (consumePress) {
    keys.firePressed = false;
    keys.altPressed = false;
  }
  return {
    type: "input",
    yaw,
    pitch,
    w: active && !!keys.KeyW,
    a: active && !!keys.KeyA,
    s: active && !!keys.KeyS,
    d: active && !!keys.KeyD,
    walk: active && !!keys.ShiftLeft,
    crouch: active && !!keys.ControlLeft,
    jump: active && !!keys.Space,
    fire: active && !!keys.fire,
    firePressed,
    altPressed,
    altFire: active && !!keys.ads && !!WEAPONS[weapon]?.alternate,
    ads: active && !!keys.ads && !!WEAPONS[weapon]?.canAim,
    use: active && !!keys.KeyF,
  };
}
setInterval(() => {
  if (joined) send({ type: "ping", stamp: performance.now() });
}, 2000);
const spikeMesh = new THREE.Group();
box(0.45, 0.55, 0.45, 0, 0.28, 0, "#23414a", spikeMesh);
box(0.12, 0.65, 0.12, 0, 0.35, 0, "#83fbe5", spikeMesh);
scene.add(spikeMesh);
spikeMesh.visible = false;
function minimap(p) {
  const c = $("minimap"),
    ctx = c.getContext("2d"),
    scale = 3;
  ctx.clearRect(0, 0, 200, 200);
  ctx.save();
  ctx.translate(100, 100);
  for (const [x, z, w, d] of MAP.walls) {
    ctx.fillStyle = "#71898e";
    ctx.fillRect(
      (x - w / 2) * scale,
      (z - d / 2) * scale,
      w * scale,
      d * scale,
    );
  }
  for (const s of MAP.sites) {
    ctx.fillStyle = "#e4cc95";
    ctx.font = "bold 13px Arial";
    ctx.fillText(s.name, s.x * scale - 4, s.z * scale + 4);
  }
  for (const q of state.players) {
    if (!q.alive || q.visible === false) continue;
    ctx.fillStyle =
      q.id === id ? "#fff" : q.team === p.team ? "#80e8d3" : "#ff5965";
    ctx.beginPath();
    ctx.arc(q.x * scale, q.z * scale, q.id === id ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(p.x * scale, p.z * scale);
  ctx.lineTo(
    p.x * scale - Math.sin(yaw) * 10,
    p.z * scale - Math.cos(yaw) * 10,
  );
  ctx.stroke();
  if (state.spike && !state.spike.hidden) {
    ctx.fillStyle = "#ffd481";
    ctx.fillRect(state.spike.x * scale - 2, state.spike.z * scale - 2, 4, 4);
  }
  for (const mark of state.pings || []) {
    ctx.strokeStyle = "#ffd481";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mark.x * scale, mark.z * scale, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
let previous = performance.now(),
  lastBeep = 0,
  spectating = null;
let selectedSpectator = null;
function cycleSpectator(step) {
  const self = state?.players.find((p) => p.id === id);
  if (!self || self.alive) return;
  const allies = state.players.filter((p) => p.alive && p.team === self.team);
  if (!allies.length) return;
  const current = Math.max(
    0,
    allies.findIndex((p) => p.id === (selectedSpectator || spectating)),
  );
  selectedSpectator =
    allies[(current + step + allies.length) % allies.length].id;
}
$("spectator-prev").onclick = () => cycleSpectator(-1);
$("spectator-next").onclick = () => cycleSpectator(1);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  frameCount++;
  if (now - lastFps > 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFps = now;
  }
  $("net").textContent = `${fps} FPS · ${latency} ms · 20 Hz snapshot`;
  inputAccumulator = Math.min(inputAccumulator + dt, INPUT_DT * 3);
  while (inputAccumulator >= INPUT_DT) {
    inputAccumulator -= INPUT_DT;
    if (joined && state) {
      const command = {
        ...input(true),
        seq: ++seq,
        round: state.round,
        viewTime: serverNow() - INTERPOLATION_DELAY,
      };
      send(command);
      const self = state.players.find((p) => p.id === id);
      if (local && self?.alive && ["buy", "live"].includes(state.phase)) {
        simulateCommand(local, command, state.phase);
        pendingInputs.push(command);
        if (pendingInputs.length > 120) pendingInputs.shift();
      }
    }
  }
  barriers.visible = joined && state?.phase === "buy";
  if (!joined || !state || state.phase === "lobby") {
    show("scope", false);
    camera.position.set(37 + Math.sin(now * 0.00007) * 3, 27, 39);
    camera.lookAt(0, 0, -5);
    gun.visible = false;
  } else {
    const p = state.players.find((p) => p.id === id);
    if (p && local) {
      $("resume").style.display =
        p.alive && !locked && !shop && !settingsOpen ? "" : "none";
      const rendered = { ...local, yaw };
      if (["buy", "live", "end"].includes(state.phase) && p.alive)
        move(rendered, input(), inputAccumulator);
      if (state.phase === "buy") buyBarrier(rendered);
      const decay = Math.exp(-dt * 15);
      correction.x *= decay;
      correction.y *= decay;
      correction.z *= decay;
      camera.position.set(
        rendered.x + correction.x,
        Math.max(0, local.y + local.vy * inputAccumulator) +
          correction.y +
          (p.crouch ? 1.05 : 1.6),
        rendered.z + correction.z,
      );
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      spectating = null;
      if (!p.alive) {
        const allies = state.players.filter(
          (q) => q.team === p.team && q.alive,
        );
        const ally =
          allies.find((q) => q.id === selectedSpectator) || allies[0];
        if (ally) {
          selectedSpectator = ally.id;
          spectating = ally.id;
          const pose =
            snapshots.pose(ally.id, serverNow() - INTERPOLATION_DELAY) || ally;
          camera.position.set(
            pose.x,
            pose.y + (pose.crouch ? 1.05 : 1.6),
            pose.z,
          );
          camera.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
          $("blind").style.opacity = Math.min(
            1,
            Math.max(0, ally.blindUntil - serverNow()),
          );
          $("spectate").textContent =
            `${ally.name} 관전 중 · 체력 ${ally.hp} · [ / ] 대상 전환`;
        }
      } else selectedSpectator = null;
      const readyToAim =
        !(p.reloadUntil > serverNow()) && !(p.equipUntil > serverNow());
      camera.fov = THREE.MathUtils.lerp(
        camera.fov,
        p.alive && readyToAim && keys.ads && WEAPONS[p.weapon].canAim
          ? p.weapon === "sniper"
            ? 32
            : 60
          : 78,
        0.2,
      );
      camera.updateProjectionMatrix();
      const scoped = p.alive && readyToAim && keys.ads && p.weapon === "sniper";
      show("scope", scoped);
      gun.visible = p.alive && !scoped;
      const flash = gun.children[0]?.userData.flash;
      if (flash) flash.visible = now < flashUntil;
      recoil *= 0.8;
      gun.position.set(
        readyToAim && keys.ads && WEAPONS[p.weapon].canAim ? 0.055 : 0.26,
        -0.23 + Math.sin(now * 0.008) * (keys.KeyW && locked ? 0.008 : 0),
        -0.55 + recoil,
      );
      gun.rotation.x = recoil;
      const reloadMotion = reloadPose(p, serverNow(), WEAPONS[p.weapon].reload);
      animateWeaponReload(gun.children[0], reloadMotion);
      if (p.equipUntil > serverNow()) {
        const remaining = Math.min(
          1,
          (p.equipUntil - serverNow()) / WEAPONS[p.weapon].equip,
        );
        gun.position.y -= remaining * 0.35;
        gun.rotation.z = remaining * -0.3;
      } else {
        gun.rotation.z = -0.65 * reloadMotion.lower;
        gun.rotation.x += 0.2 * reloadMotion.lower;
        gun.position.y -= 0.16 * reloadMotion.lower;
      }
      minimap(p);
      const aim = shotProfile(
        p.weapon,
        { ...p, y: local.y, input: input() },
        serverNow(),
      );
      const gap = Math.min(
        45,
        4 +
          (innerHeight * Math.tan(aim.spread / 2)) /
            (2 * Math.tan((camera.fov * Math.PI) / 360)),
      );
      $("crosshair").style.setProperty("--gap", `${gap.toFixed(1)}px`);
      $("crosshair").style.opacity = p.alive && !scoped ? 1 : 0;
    }
  }
  for (const g of avatars.values()) {
    if (g.userData.target?.visible === false) {
      g.visible = false;
      continue;
    }
    const q =
      snapshots.pose(
        g.userData.target?.id,
        serverNow() - INTERPOLATION_DELAY,
      ) || g.userData.target;
    if (!q || q.visible === false) {
      g.visible = false;
      continue;
    }
    g.visible = q.alive && q.id !== spectating;
    g.position.set(q.x, q.y, q.z);
    g.rotation.y = q.yaw;
    animateAgent(g, q, dt);
  }
  if (state) {
    const visibleOrbs =
      !state.spike?.planted && ["buy", "live"].includes(state.phase)
        ? (state.orbs || []).filter((orb) => orb.available)
        : [];
    for (const orb of visibleOrbs) {
      if (!orbMeshes.has(orb.id)) {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.3),
          new THREE.MeshStandardMaterial({
            color: "#bbf9ec",
            emissive: "#42bca5",
            emissiveIntensity: 0.7,
            metalness: 0.3,
            roughness: 0.25,
          }),
        );
        scene.add(mesh);
        orbMeshes.set(orb.id, mesh);
      }
      const mesh = orbMeshes.get(orb.id);
      mesh.position.set(orb.x, 1 + Math.sin(now * 0.003) * 0.08, orb.z);
      mesh.rotation.y = now * 0.001;
    }
    for (const [key, mesh] of orbMeshes)
      if (!visibleOrbs.some((orb) => orb.id === key)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        orbMeshes.delete(key);
      }
    for (const mark of state.pings || []) {
      if (!pingMeshes.has(mark.id)) {
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.2, 0.45, 4),
          new THREE.MeshBasicMaterial({ color: "#ffd481", depthTest: false }),
        );
        mesh.rotation.z = Math.PI;
        mesh.renderOrder = 20;
        scene.add(mesh);
        pingMeshes.set(mark.id, mesh);
      }
      pingMeshes
        .get(mark.id)
        .position.set(
          mark.x,
          mark.y + 0.5 + Math.sin(now * 0.006) * 0.08,
          mark.z,
        );
    }
    for (const [key, mesh] of pingMeshes)
      if (!(state.pings || []).some((p) => p.id === key)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        pingMeshes.delete(key);
      }
    for (const loot of state.drops || []) {
      if (!lootMeshes.has(loot.id)) {
        const group = new THREE.Group();
        const model = createWeapon(loot.weapon);
        model.rotation.z = Math.PI / 2;
        model.position.y = 0.12;
        group.add(model);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.45, 0.48, 32),
          new THREE.MeshBasicMaterial({
            color: "#8fe5d2",
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.025;
        ring.userData.ownedMaterial = true;
        group.add(ring);
        group.position.set(loot.x, 0, loot.z);
        scene.add(group);
        lootMeshes.set(loot.id, group);
      }
    }
    for (const [key, mesh] of lootMeshes)
      if (!state.drops?.some((d) => d.id === key)) {
        disposeModel(mesh);
        lootMeshes.delete(key);
      }
    if (
      state.spike?.planted &&
      state.phase === "live" &&
      now - lastBeep > (state.end - state.time < 10 ? 300 : 900)
    ) {
      sound(880, 0.06, 0.025, "sine");
      lastBeep = now;
    }
    while (smokeMeshes.length > state.smokes.length) {
      const m = smokeMeshes.pop();
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    state.smokes.forEach((s, i) => {
      if (!smokeMeshes[i]) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(4.5, 24, 16),
          new THREE.MeshStandardMaterial({
            color: "#738baa",
            roughness: 1,
            transparent: true,
            opacity: 0.97,
            side: THREE.DoubleSide,
          }),
        );
        scene.add(m);
        smokeMeshes.push(m);
      }
      smokeMeshes[i].position.set(s.x, 1.5, s.z);
    });
    spikeMesh.visible =
      !!state.spike && !state.spike.hidden && !state.spike.carrier;
    if (state.spike && !state.spike.hidden) {
      spikeMesh.position.set(state.spike.x, 0.01, state.spike.z);
      spikeMesh.rotation.y = now * 0.001;
    }
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    if (effect.radius) {
      const progress = Math.min(
        1,
        (now - effect.start) / (effect.end - effect.start),
      );
      effect.mesh.scale.setScalar(Math.max(0.01, progress * effect.radius));
      effect.mesh.material.opacity = 0.3 * (1 - progress);
    }
    if (effects[i].end < now) {
      scene.remove(effects[i].mesh);
      effects[i].mesh.geometry.dispose();
      effects[i].mesh.material.dispose();
      effects.splice(i, 1);
    }
  }
  $("hitmarker").style.opacity = now < hitUntil ? 1 : 0;
  $("hit-info").style.opacity = now < hitInfoUntil ? 1 : 0;
  $("damage").style.opacity = now < damageUntil ? 1 : 0;
  renderer.render(scene, camera);
  if (gun.visible) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(weaponScene, weaponCamera);
    renderer.autoClear = true;
  }
}
requestAnimationFrame(frame);
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  weaponCamera.aspect = innerWidth / innerHeight;
  weaponCamera.updateProjectionMatrix();
  camera.updateProjectionMatrix();
});
