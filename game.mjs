import {
  MAP,
  CORE_BLAST,
  ARMOR,
  WEAPONS,
  AGENTS,
  clamp,
  move,
  blocked,
  direction,
  shotProfile,
  wallDistance,
  rayPlayer,
} from "./shared.mjs";
import { findPath } from "./navigation.mjs";
import { seesEnemy, botObjective, smokeBlocks } from "./tactics.mjs";
import { damageAtDistance, traceBullet, isBackstab } from "./ballistics.mjs";
import { restrictVisibility } from "./visibility.mjs";
import { movementSound } from "./hearing.mjs";
import {
  simulateCommand,
  INPUT_DT,
  MAX_REWIND,
  interpolatePose,
} from "./netcode.mjs";
export class Game {
  constructor(
    code,
    {
      buy = 20,
      round = 100,
      fuse = 40,
      plant = 4,
      defuse = 7,
      random = Math.random,
    } = {},
  ) {
    this.code = code;
    this.players = new Map();
    this.time = 0;
    this.phase = "lobby";
    this.end = 0;
    this.round = 0;
    this.score = [0, 0];
    this.teamIds = [0, 1];
    this.roundHistory = [];
    this.lossStreak = [0, 0];
    this.events = [];
    this.smokes = [];
    this.cfg = { buy, round, fuse, plant, defuse };
    this.spike = null;
    this.owner = null;
    this.winner = null;
    this.eventId = 0;
    this.random = random;
    this.drops = [];
    this.dropId = 0;
    this.overtime = false;
    this.pings = [];
    this.pingId = 0;
    this.orbs = [];
  }
  chooseTeam(id, team) {
    const p = this.players.get(id);
    if (!p || this.phase !== "lobby" || ![0, 1].includes(team)) return false;
    if (p.team === team) return true;
    if ([...this.players.values()].filter((q) => q.team === team).length >= 5)
      return false;
    p.team = team;
    for (const q of this.players.values()) this.spawn(q);
    return true;
  }
  configure(id, overtime) {
    if (
      id !== this.owner ||
      this.phase !== "lobby" ||
      typeof overtime !== "boolean"
    )
      return false;
    this.overtime = overtime;
    return true;
  }
  returnToLobby(id) {
    if (id !== this.owner || this.phase !== "match") return false;
    this.phase = "lobby";
    this.round = 0;
    this.teamIds = [0, 1];
    this.roundHistory = [];
    this.score = [0, 0];
    this.lossStreak = [0, 0];
    this.winner = null;
    this.spike = null;
    this.pings = [];
    this.orbs = [];
    this.smokes = [];
    this.drops = [];
    for (const p of this.players.values()) this.spawn(p);
    return true;
  }
  removeBots(id) {
    if (id !== this.owner || this.phase !== "lobby") return false;
    for (const p of [...this.players.values()]) if (p.bot) this.remove(p.id);
    for (const p of this.players.values()) this.spawn(p);
    return true;
  }
  matchWon() {
    return (
      Math.max(...this.score) >= 13 &&
      (!this.overtime || Math.abs(this.score[0] - this.score[1]) >= 2)
    );
  }
  event(type, data = {}) {
    this.events.push({ id: ++this.eventId, type, time: this.time, ...data });
    // A synchronized ten-player alternate volley plus kills/steps can exceed 30.
    this.events = this.events.slice(-256);
  }
  add(id, name, agent = "veil", bot = false) {
    if (this.players.size >= 10) return null;
    const counts = [0, 0];
    for (const p of this.players.values()) counts[p.team]++;
    const team = counts[0] <= counts[1] ? 0 : 1;
    let p = {
      id,
      name: (typeof name === "string" && name ? name : "요원")
        .replace(/[<>\u0000-\u001f\u007f]/g, "")
        .slice(0, 16),
      agent:
        typeof agent === "string" && Object.hasOwn(AGENTS, agent)
          ? agent
          : "veil",
      team,
      bot,
      connected: true,
      botOffset: this.players.size * 0.73,
      x: 0,
      z: 0,
      y: 0,
      vy: 0,
      yaw: 0,
      pitch: 0,
      hp: 100,
      armor: 0,
      credits: 800,
      kills: 0,
      assists: 0,
      deaths: 0,
      weapon: "pistol",
      primary: null,
      magazines: {},
      burst: 0,
      ammo: 12,
      reserve: 48,
      input: {},
      seq: 0,
      ack: 0,
      commands: [],
      commandBudget: 0,
      history: [],
      jumpHeld: false,
      lastInput: 0,
      lastShot: -10,
      reloadUntil: 0,
      skill: 1,
      secondary: 0,
      ultimate: 0,
      blindUntil: 0,
      focusUntil: 0,
      slow: 0,
      progress: 0,
      alive: this.phase === "lobby",
      revealUntil: 0,
    };
    this.players.set(id, p);
    if (!this.owner && !bot) this.owner = id;
    this.spawn(p);
    if (this.phase !== "lobby") {
      p.alive = false;
      p.awaitingSpawn = true;
    }
    return p;
  }
  remove(id) {
    this.players.delete(id);
    if (this.spike?.carrier === id) {
      this.spike.carrier = null;
      this.spike.x = this.lastCarrier?.x ?? 0;
      this.spike.z = this.lastCarrier?.z ?? 20;
    }
    if (this.owner === id)
      this.owner =
        [...this.players.values()].find((p) => !p.bot && p.connected)?.id ??
        null;
  }
  spawn(p) {
    p.awaitingSpawn = false;
    let index = [...this.players.values()]
      .filter((q) => q.team === p.team)
      .indexOf(p);
    p.x = (index - 2) * 1.5;
    p.z = p.team === 0 ? 26 : -26;
    p.yaw = p.team === 0 ? 0 : Math.PI;
    p.pitch = 0;
    p.y = 0;
    p.vy = 0;
    p.hp = 100;
    p.alive = true;
    p.progress = 0;
    p.orbProgress = 0;
    p.orbId = null;
    p.reloadUntil = 0;
    p.input = {};
    p.equipUntil = 0;
    p.requestedWeapon = null;
    p.weaponPurchases = [];
    p.armorPurchase = null;
    p.secondaryPurchases = [];
    p.combatReport = [];
    p.supportContributions = new Map();
    p.lastPing = -10;
    p.skill = 1;
    p.revealUntil = 0;
    p.blindUntil = 0;
    p.focusUntil = 0;
    p.slow = 0;
    p.landingUntil = 0;
    p.queuedBurst = null;
    p.path = null;
    p.botTarget = null;
    p.botSkillAfter = this.time;
    p.lastShot = -10;
    p.burst = 0;
    p.recoilWeapon = null;
    p.commands = [];
    p.ack = p.seq;
    p.commandBudget = 0;
    p.jumpHeld = false;
    p.triggerHeld = false;
    p.altHeld = false;
    p.nextShotAt = 0;
    p.stepDistance = 0;
    p.history = [];
  }
  start(id) {
    if (id !== this.owner || !["lobby", "match"].includes(this.phase))
      return false;
    this.score = [0, 0];
    this.teamIds = [0, 1];
    this.roundHistory = [];
    this.lossStreak = [0, 0];
    this.round = 0;
    for (const p of this.players.values()) {
      p.credits = 800;
      p.weapon = "pistol";
      p.primary = null;
      p.armor = 0;
      p.kills = 0;
      p.assists = 0;
      p.deaths = 0;
      p.secondary = 0;
      p.ultimate = 0;
    }
    this.nextRound();
    return true;
  }
  nextRound() {
    this.round++;
    this.orbs = MAP.orbs.map((orb) => ({ ...orb, available: true }));
    this.pings = [];
    const overtimeRound = this.overtime && this.round >= 25;
    if (this.round === 13 || overtimeRound) {
      this.lossStreak = [0, 0];
      for (const p of this.players.values()) {
        p.team = 1 - p.team;
        p.credits = overtimeRound ? 5000 : 800;
        p.weapon = "pistol";
        p.primary = null;
        p.armor = 0;
        p.secondary = 0;
        p.ultimate = 0;
      }
      this.score.reverse();
      this.teamIds.reverse();
    }
    this.phase = "buy";
    this.end = this.time + this.cfg.buy;
    this.smokes = [];
    this.drops = [];
    this.winner = null;
    for (const p of this.players.values()) {
      this.spawn(p);
      p.weapon = p.primary || "pistol";
      p.magazines = {};
      const w = WEAPONS[p.weapon];
      p.ammo = w.mag;
      p.reserve = w.reserve;
    }
    let carrier = [...this.players.values()].find(
      (p) => p.team === 0 && p.connected,
    );
    this.spike = {
      carrier: carrier?.id ?? null,
      x: carrier?.x ?? 0,
      z: 26,
      planted: false,
      defuseCheckpoint: 0,
      defuser: null,
    };
    this.event("round", { round: this.round });
  }
  input(id, msg) {
    const p = this.players.get(id);
    if (
      !p ||
      !Number.isFinite(msg.yaw) ||
      !Number.isFinite(msg.pitch) ||
      !Number.isSafeInteger(msg.seq) ||
      msg.seq <= p.seq ||
      msg.seq < 0 ||
      msg.round !== this.round ||
      p.commands.length >= 12
    )
      return;
    p.seq = msg.seq;
    const command = Object.fromEntries(
      [
        "w",
        "a",
        "s",
        "d",
        "walk",
        "crouch",
        "jump",
        "fire",
        "firePressed",
        "altFire",
        "altPressed",
        "use",
        "ads",
      ].map((k) => [k, msg[k] === true]),
    );
    Object.assign(command, {
      seq: msg.seq,
      yaw: msg.yaw % (Math.PI * 2),
      pitch: clamp(msg.pitch, -1.45, 1.45),
      viewTime: Number.isFinite(msg.viewTime)
        ? clamp(msg.viewTime, this.time - MAX_REWIND, this.time)
        : this.time,
      received: this.time,
    });
    p.commands.push(command);
    p.lastInput = this.time;
  }
  consumeCommand(p, dt) {
    p.commandBudget = Math.min(INPUT_DT, p.commandBudget + dt);
    if (p.commandBudget + 1e-8 < INPUT_DT) return;
    if (!p.commands.length) {
      if (
        p.alive &&
        ["buy", "live", "end"].includes(this.phase) &&
        (p.y > 0 || p.vy > 0)
      ) {
        simulateCommand(p, { yaw: p.yaw, pitch: p.pitch }, this.phase);
        p.commandBudget -= INPUT_DT;
      }
      return;
    }
    const command = p.commands.shift();
    p.commandBudget -= INPUT_DT;
    p.input = command;
    p.yaw = command.yaw;
    p.pitch = command.pitch;
    p.ack = command.seq;
    if (
      p.alive &&
      ["buy", "live", "end"].includes(this.phase) &&
      this.time - command.received < 0.4
    )
      simulateCommand(p, command, this.phase);
  }
  recordHistory() {
    for (const p of this.players.values()) {
      p.history.push({
        time: this.time,
        x: p.x,
        z: p.z,
        y: p.y,
        yaw: p.yaw,
        pitch: p.pitch,
        crouch: !!p.input.crouch,
        alive: p.alive,
      });
      while (
        p.history.length > 1 &&
        p.history[0].time < this.time - MAX_REWIND - 0.05
      )
        p.history.shift();
    }
  }
  historicalPose(p, time) {
    if (!p.history.length || time >= this.time)
      return { ...p, crouch: !!p.input.crouch };
    const target = clamp(time, this.time - MAX_REWIND, this.time);
    let a = p.history[0];
    for (const b of p.history) {
      if (b.time >= target)
        return interpolatePose(
          a,
          b,
          b.time === a.time ? 1 : (target - a.time) / (b.time - a.time),
        );
      a = b;
    }
    return interpolatePose(
      a,
      { ...p, crouch: !!p.input.crouch },
      (target - a.time) / (this.time - a.time || 1),
    );
  }
  mark(id) {
    const p = this.players.get(id);
    if (
      !p?.alive ||
      !p.connected ||
      !["buy", "live", "end"].includes(this.phase) ||
      this.time - p.lastPing < 1
    )
      return false;
    const origin = [p.x, p.y + (p.input.crouch ? 1.05 : 1.6), p.z];
    const ray = direction(p.yaw, p.pitch);
    const ground = ray[1] < -0.001 ? -origin[1] / ray[1] : Infinity;
    const hit = Math.min(ground, wallDistance(origin, ray));
    if (!Number.isFinite(hit) || hit > 40) return false;
    const distance = Math.max(0, hit - 0.08);
    const point = origin.map((v, i) => v + ray[i] * distance);
    p.lastPing = this.time;
    this.pings = this.pings.filter((q) => q.player !== id && q.end > this.time);
    this.pings.push({
      id: ++this.pingId,
      player: id,
      team: p.team,
      name: p.name,
      x: point[0],
      y: point[1],
      z: point[2],
      end: this.time + 5,
    });
    return true;
  }
  requestWeapon(id, item) {
    const p = this.players.get(id);
    if (!p?.alive || !p.connected || this.phase !== "buy") return false;
    if (item === null) {
      p.requestedWeapon = null;
      return true;
    }
    if (
      !["rifle", "smg", "shotgun", "burstRifle", "sniper"].includes(item) ||
      p.primary
    )
      return false;
    p.requestedWeapon = item;
    return true;
  }
  sponsorWeapon(id, targetId, item) {
    const payer = this.players.get(id),
      target = this.players.get(targetId);
    if (
      this.phase !== "buy" ||
      !payer?.alive ||
      !target?.alive ||
      !payer.connected ||
      !target.connected ||
      payer === target ||
      payer.team !== target.team ||
      !["rifle", "smg", "shotgun", "burstRifle", "sniper"].includes(item) ||
      target.requestedWeapon !== item ||
      target.primary ||
      payer.credits < WEAPONS[item].cost
    )
      return false;
    payer.credits -= WEAPONS[item].cost;
    target.magazines[target.weapon] = {
      ammo: target.ammo,
      reserve: target.reserve,
    };
    target.weapon = target.primary = item;
    target.ammo = WEAPONS[item].mag;
    target.reserve = WEAPONS[item].reserve;
    target.reloadUntil = 0;
    target.requestedWeapon = null;
    this.beginEquip(target);
    return true;
  }
  buy(id, item) {
    const p = this.players.get(id);
    if (item === "secondary") {
      if (!p?.alive || this.phase !== "buy") return false;
      const config = AGENTS[p.agent].secondary;
      if (p.credits < config.cost || p.secondary >= config.max) return false;
      p.secondaryPurchases.push({ cost: config.cost, previous: p.secondary });
      p.credits -= config.cost;
      p.secondary++;
      return true;
    }
    if (
      typeof item !== "string" ||
      ![
        "armor",
        "lightArmor",
        "pistol",
        "rifle",
        "smg",
        "shotgun",
        "burstRifle",
        "sniper",
      ].includes(item)
    )
      return false;
    if (!p || !p.alive || this.phase !== "buy") return false;
    const shield = ARMOR[item];
    const cost = shield?.cost ?? WEAPONS[item]?.cost;
    if (cost === undefined || p.credits < cost) return false;
    if (shield) {
      if (p.armor >= shield.armor) return false;
      p.armorPurchase = {
        cost,
        previous: p.armor,
        armor: shield.armor,
        previousReceipt: p.armorPurchase,
      };
      p.armor = shield.armor;
    } else {
      if (p.weapon === item) return false;
      if (item === p.primary) return false;
      p.magazines[p.weapon] = { ammo: p.ammo, reserve: p.reserve };
      if (item !== "pistol")
        p.weaponPurchases.push({
          item,
          cost,
          previous: p.primary,
          magazine: p.primary ? { ...p.magazines[p.primary] } : null,
        });
      p.weapon = item;
      if (item !== "pistol") {
        p.primary = item;
        p.requestedWeapon = null;
      }
      p.ammo = WEAPONS[item].mag;
      p.reserve = WEAPONS[item].reserve;
      p.reloadUntil = 0;
      this.beginEquip(p);
    }
    p.credits -= cost;
    return true;
  }
  refundWeapon(id) {
    const p = this.players.get(id);
    if (!p?.alive || !p.connected || this.phase !== "buy") return false;
    const receipt = p.weaponPurchases.at(-1);
    if (!receipt || p.primary !== receipt.item) return false;
    p.weaponPurchases.pop();
    p.credits = Math.min(9000, p.credits + receipt.cost);
    delete p.magazines[receipt.item];
    p.primary = receipt.previous;
    if (receipt.previous)
      p.magazines[receipt.previous] = { ...receipt.magazine };
    if (p.weapon === receipt.item) {
      p.weapon = receipt.previous || "pistol";
      p.ammo = p.magazines[p.weapon]?.ammo ?? WEAPONS[p.weapon].mag;
      p.reserve = p.magazines[p.weapon]?.reserve ?? WEAPONS[p.weapon].reserve;
      p.reloadUntil = 0;
      this.beginEquip(p);
    }
    return true;
  }
  refundEquipment(id, item) {
    const p = this.players.get(id);
    if (!p?.alive || !p.connected || this.phase !== "buy") return false;
    if (item === "armor") {
      if (!p.armorPurchase || p.armor !== p.armorPurchase.armor) return false;
      p.credits = Math.min(9000, p.credits + p.armorPurchase.cost);
      p.armor = p.armorPurchase.previous;
      p.armorPurchase = p.armorPurchase.previousReceipt;
      return true;
    }
    if (item === "secondary") {
      const receipt = p.secondaryPurchases.at(-1);
      if (!receipt || p.secondary !== receipt.previous + 1) return false;
      p.secondaryPurchases.pop();
      p.secondary = receipt.previous;
      p.credits = Math.min(9000, p.credits + receipt.cost);
      return true;
    }
    return false;
  }
  beginEquip(p) {
    p.queuedBurst = null;
    p.equipUntil = Math.max(
      p.equipUntil || 0,
      this.time + WEAPONS[p.weapon].equip,
    );
  }
  select(id, slot) {
    const p = this.players.get(id);
    if (!p?.alive || !["buy", "live", "end"].includes(this.phase)) return false;
    const weapon =
      slot === 1
        ? p.primary
        : slot === 2
          ? "pistol"
          : slot === 3
            ? "knife"
            : null;
    if (!weapon || weapon === p.weapon) return false;
    p.magazines[p.weapon] = { ammo: p.ammo, reserve: p.reserve };
    p.weapon = weapon;
    p.ammo = p.magazines[weapon]?.ammo ?? WEAPONS[weapon].mag;
    p.reserve = p.magazines[weapon]?.reserve ?? WEAPONS[weapon].reserve;
    p.reloadUntil = 0;
    this.beginEquip(p);
    return true;
  }
  dropCore(id) {
    const p = this.players.get(id);
    if (!p?.alive || this.phase !== "live" || this.spike?.carrier !== id)
      return false;
    this.spike.carrier = null;
    this.spike.x = p.x;
    this.spike.z = p.z;
    this.spike.droppedBy = id;
    this.spike.pickupAfter = this.time + 2;
    return true;
  }
  dropPrimary(id, death = false) {
    const p = this.players.get(id);
    if (
      !p?.primary ||
      (this.phase !== "live" && !(death && this.phase === "end")) ||
      (!death && !p.alive)
    )
      return false;
    const weapon = p.primary,
      mag =
        p.weapon === weapon
          ? { ammo: p.ammo, reserve: p.reserve }
          : (p.magazines[weapon] ?? {
              ammo: WEAPONS[weapon].mag,
              reserve: WEAPONS[weapon].reserve,
            });
    this.drops.push({
      id: ++this.dropId,
      weapon,
      ammo: mag.ammo,
      reserve: mag.reserve,
      x: p.x,
      z: p.z,
    });
    delete p.magazines[weapon];
    p.primary = null;
    if (p.weapon === weapon) {
      p.weapon = "pistol";
      p.ammo = p.magazines.pistol?.ammo ?? 12;
      p.reserve = p.magazines.pistol?.reserve ?? 48;
      if (!death) this.beginEquip(p);
    }
    p.reloadUntil = 0;
    return true;
  }
  pickup(id) {
    const p = this.players.get(id);
    if (!p?.alive || this.phase !== "live") return false;
    const loot = this.drops
      .filter((d) => Math.hypot(d.x - p.x, d.z - p.z) < 2.3)
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
      )
      .find((d) => {
        const dx = d.x - p.x,
          dz = d.z - p.z,
          len = Math.hypot(dx, dz);
        return (
          len < 0.01 ||
          wallDistance([p.x, 0.5, p.z], [dx / len, 0, dz / len]) >= len
        );
      });
    if (!loot) return false;
    this.dropPrimary(id);
    p.magazines[p.weapon] = { ammo: p.ammo, reserve: p.reserve };
    p.weapon = p.primary = loot.weapon;
    p.ammo = loot.ammo;
    p.reserve = loot.reserve;
    p.reloadUntil = 0;
    this.beginEquip(p);
    this.drops = this.drops.filter((d) => d !== loot);
    return true;
  }
  reload(id) {
    const p = this.players.get(id);
    if (
      !p?.alive ||
      p.reloadUntil ||
      p.ammo === WEAPONS[p.weapon].mag ||
      !p.reserve
    )
      return;
    p.queuedBurst = null;
    p.reloadUntil =
      Math.max(this.time, p.equipUntil || 0) + WEAPONS[p.weapon].reload;
  }
  ability(id, slot = "signature") {
    const p = this.players.get(id);
    if (!["signature", "secondary", "ultimate"].includes(slot)) return false;
    if (!p?.alive || this.phase !== "live") return false;
    if (p.agent === "haven") return this.healingAbility(p, slot);
    if (slot === "secondary") {
      if (p.secondary < 1) return false;
      p.secondary--;
      if (p.agent === "dash") p.vy = 10;
      else
        for (const q of this.players.values()) {
          if (!q.alive || q.team === p.team) continue;
          const dx = q.x - p.x,
            dz = q.z - p.z,
            len = Math.hypot(dx, dz);
          const d = direction(p.yaw, 0);
          if (len > (p.agent === "veil" ? 14 : 16) || len < 0.01) continue;
          if ((dx * d[0] + dz * d[2]) / len < 0.65) continue;
          if (wallDistance([p.x, 1.2, p.z], [dx / len, 0, dz / len]) < len)
            continue;
          if (p.agent === "veil") this.applySupport(q, p, "blindUntil", 2);
          else this.damage(q, 45, p, false, "충격 파동");
        }
    } else if (slot === "ultimate") {
      const needed = AGENTS[p.agent].ultimate.points;
      if (p.ultimate < needed) return false;
      p.ultimate = 0;
      if (p.agent === "veil") {
        for (let i = 0; i < 35; i++)
          move(p, { w: true }, 1 / 14, 5.6 * (p.slow > 0 ? 0.5 : 1));
      } else if (p.agent === "pulse") {
        for (const q of this.players.values())
          if (q.alive && q.team !== p.team)
            this.applySupport(q, p, "revealUntil", 8);
      } else {
        p.focusUntil = this.time + 12;
        p.skill = 2;
      }
    } else {
      if (!p?.alive || this.phase !== "live" || p.skill < 1) return false;
      p.skill--;
      if (p.agent === "veil") {
        let d = direction(p.yaw, 0),
          dist = Math.min(10, Math.max(0, wallDistance([p.x, 1, p.z], d) - 1));
        this.smokes.push({
          x: p.x + d[0] * dist,
          z: p.z + d[2] * dist,
          end: this.time + 12,
        });
      }
      if (p.agent === "pulse") {
        for (const q of this.players.values())
          if (
            q.alive &&
            q.team !== p.team &&
            Math.hypot(q.x - p.x, q.z - p.z) < 22
          )
            this.applySupport(q, p, "revealUntil", 4);
      }
      if (p.agent === "dash") {
        for (let i = 0; i < 16; i++)
          move(p, { w: true }, 0.08, 5.6 * (p.slow > 0 ? 0.5 : 1));
      }
    }
    this.event("skill", {
      player: id,
      slot,
      agent: p.agent,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
    });
    return true;
  }
  healingAbility(p, slot) {
    const allies = [...this.players.values()].filter((q) => {
      if (!q.alive || !q.connected || q.team !== p.team || q.hp >= 100)
        return false;
      const dx = q.x - p.x,
        dz = q.z - p.z,
        distance = Math.hypot(dx, dz);
      if (distance > 20 || (q !== p && smokeBlocks(p, q, this.smokes)))
        return false;
      return (
        distance < 0.01 ||
        wallDistance([p.x, 1.3, p.z], [dx / distance, 0, dz / distance]) >=
          distance
      );
    });
    if (slot === "secondary") {
      if (p.secondary < 1 || p.armor >= 50) return false;
      p.secondary--;
      p.armor = Math.min(50, p.armor + 25);
    } else if (slot === "ultimate") {
      if (p.ultimate < AGENTS.haven.ultimate.points || !allies.length)
        return false;
      p.ultimate = 0;
      for (const q of allies) q.hp = 100;
    } else {
      if (p.skill < 1) return false;
      const look = direction(p.yaw, p.pitch);
      const origin = [p.x, p.y + (p.input.crouch ? 1.05 : 1.6), p.z];
      let nearest = Math.min(15, wallDistance(origin, look)),
        hit = null;
      for (const q of this.players.values()) {
        if (q === p || !q.alive) continue;
        const ray = rayPlayer(origin, look, { ...q, crouch: !!q.input.crouch });
        if (ray.distance < nearest) {
          nearest = ray.distance;
          hit = q;
        }
      }
      const target =
        hit?.team === p.team &&
        hit.connected &&
        hit.hp < 100 &&
        !smokeBlocks(p, hit, this.smokes)
          ? hit
          : allies.find((q) => q === p);
      if (!target) return false;
      p.skill--;
      target.hp = Math.min(100, target.hp + 60);
    }
    this.event("skill", {
      player: p.id,
      slot,
      agent: p.agent,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
    });
    return true;
  }
  chat(id, value) {
    const p = this.players.get(id);
    if (
      !p?.connected ||
      typeof value !== "string" ||
      this.time - (p.lastChat ?? -Infinity) < 1
    )
      return false;
    const text = value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 200);
    if (!text) return false;
    p.lastChat = this.time;
    const recipients = [...this.players.values()]
      .filter((q) => q.team === p.team)
      .map((q) => q.id);
    this.event("chat", { player: id, name: p.name, text, recipients });
    return true;
  }
  applySupport(target, source, field, duration) {
    const end = this.time + duration;
    target[field] = Math.max(target[field] || 0, end);
    target.supportContributions.set(
      source.id,
      Math.max(target.supportContributions.get(source.id) || 0, end),
    );
  }
  collectOrb(p, dt, busy = false) {
    const reset = () => {
      p.orbProgress = 0;
      p.orbId = null;
    };
    if (
      this.phase !== "live" ||
      this.spike?.planted ||
      this.time > this.end + 1e-8 ||
      !p.alive ||
      !p.connected ||
      busy ||
      !p.input.use ||
      p.y > 0 ||
      ["w", "a", "s", "d", "fire", "firePressed", "altFire", "altPressed"].some(
        (k) => p.input[k],
      ) ||
      p.ultimate >= AGENTS[p.agent].ultimate.points
    ) {
      reset();
      return;
    }
    const orb = this.orbs.find(
      (o) => o.available && Math.hypot(o.x - p.x, o.z - p.z) < 2,
    );
    if (!orb) {
      reset();
      return;
    }
    const dx = orb.x - p.x,
      dz = orb.z - p.z,
      len = Math.hypot(dx, dz);
    if (
      len > 0.01 &&
      wallDistance([p.x, 1, p.z], [dx / len, 0, dz / len]) < len
    ) {
      reset();
      return;
    }
    if (p.orbId !== orb.id) {
      p.orbId = orb.id;
      p.orbProgress = 0;
    }
    p.orbProgress += dt;
    if (p.orbProgress + 1e-8 >= 3) {
      orb.available = false;
      this.awardUltimate(p);
      reset();
    }
  }
  awardUltimate(p) {
    p.ultimate = Math.min(AGENTS[p.agent].ultimate.points, p.ultimate + 1);
  }
  damage(
    target,
    damage,
    p,
    head = false,
    weapon = p.weapon,
    region = head ? "head" : "body",
  ) {
    if (
      !target.alive ||
      target.team === p.team ||
      !Number.isFinite(damage) ||
      damage <= 0
    )
      return;
    target.slow = 0.35;
    const absorb = Math.min(target.armor, damage * 0.66);
    const health = Math.min(target.hp, damage - absorb);
    const zone = WEAPONS[weapon] ? region : "ability";
    for (const [owner, other, direction] of [
      [p, target, "out"],
      [target, p, "in"],
    ]) {
      let row = owner.combatReport.find(
        (r) =>
          r.opponent === other.id &&
          r.direction === direction &&
          r.weapon === weapon &&
          r.region === zone,
      );
      if (!row) {
        row = {
          opponent: other.id,
          name: other.name,
          direction,
          weapon,
          region: zone,
          health: 0,
          armor: 0,
          hits: 0,
        };
        owner.combatReport.push(row);
      }
      row.health += health;
      row.armor += absorb;
      row.hits++;
    }
    target.armor -= absorb;
    target.hp -= damage - absorb;
    target.progress = 0;
    target.orbProgress = 0;
    target.orbId = null;
    if (target.hp > 0) return;
    this.dropPrimary(target.id, true);
    target.hp = 0;
    target.alive = false;
    target.deaths++;
    this.awardUltimate(target);
    p.kills++;
    // Damage assists use actual health + armor loss in this round. Aggregate
    // across weapons/regions, then award once per teammate (never the killer).
    const contributions = new Map();
    for (const row of target.combatReport) {
      if (row.direction !== "in" || row.opponent === p.id) continue;
      contributions.set(
        row.opponent,
        (contributions.get(row.opponent) || 0) + row.health + row.armor,
      );
    }
    const helpers = new Set(
      [...contributions]
        .filter(([, dealt]) => dealt >= 50 - 1e-8)
        .map(([id]) => id),
    );
    for (const [id, end] of target.supportContributions) {
      if (end > this.time) helpers.add(id);
    }
    for (const id of helpers) {
      const helper = this.players.get(id);
      if (id !== p.id && helper && helper.team === p.team) {
        helper.assists++;
        this.event("assist", {
          player: id,
          victim: target.name,
          round: this.round,
          damage: (contributions.get(id) || 0) >= 50 - 1e-8,
          utility: (target.supportContributions.get(id) || 0) > this.time,
        });
      }
    }
    this.awardUltimate(p);
    p.credits = Math.min(9000, p.credits + 200);
    if (this.spike?.carrier === target.id) {
      this.spike.carrier = null;
      this.spike.x = target.x;
      this.spike.z = target.z;
    }
    this.event("kill", { killer: p.name, victim: target.name, head, weapon });
  }
  trigger(p) {
    const alternate = p.input.altFire === true;
    const altPressed = p.input.altPressed === true || (alternate && !p.altHeld);
    p.altHeld = alternate;
    p.input.altPressed = false;
    const held = p.input.fire === true;
    const pressed = p.input.firePressed === true || (held && !p.triggerHeld);
    p.triggerHeld = held;
    p.input.firePressed = false;
    if (WEAPONS[p.weapon].alternate && altPressed) {
      this.shoot(p, true);
      return;
    }
    if (WEAPONS[p.weapon].fireMode === "semi" ? pressed : held || pressed)
      this.shoot(p);
  }
  shoot(p, alternate = false) {
    const w = WEAPONS[p.weapon];
    const alt = alternate ? w.alternate : null;
    if (alternate && !alt) return;
    if (
      this.phase !== "live" ||
      !p.alive ||
      p.reloadUntil ||
      this.time < (p.equipUntil || 0) ||
      this.time < (p.nextShotAt || 0) ||
      p.ammo <= 0 ||
      this.time - p.lastShot < w.rate
    )
      return;
    const pellets = alt ? Math.min(p.ammo, alt.pellets) : (w.pellets ?? 1);
    if (p.weapon !== "knife") p.ammo -= alt ? pellets : 1;
    const profile = shotProfile(p.weapon, p, this.time);
    if (alt)
      profile.spread =
        w.spread > 0 ? (profile.spread * alt.spread) / w.spread : alt.spread;
    profile.alternate = alternate;
    p.burst = Math.min(12, profile.heat + 1);
    p.recoilWeapon = p.weapon;
    p.lastShot = this.time;
    p.nextShotAt = this.time + (alt?.rate ?? w.rate);
    for (let pellet = 0; pellet < pellets; pellet++)
      this.fireRay(p, alt ? { ...w, ...alt } : w, profile, pellet);
    if (w.burstCount && !alternate)
      p.queuedBurst = {
        weapon: p.weapon,
        remaining: w.burstCount - 1,
        next: this.time + w.burstSpacing,
      };
  }
  advanceBurst(p) {
    const queued = p.queuedBurst;
    if (!queued) return;
    if (
      this.phase !== "live" ||
      !p.alive ||
      !p.connected ||
      p.weapon !== queued.weapon ||
      p.reloadUntil ||
      p.ammo <= 0
    ) {
      p.queuedBurst = null;
      return;
    }
    if (this.time + 1e-8 < queued.next) return;
    const w = WEAPONS[p.weapon],
      profile = shotProfile(p.weapon, p, this.time);
    p.ammo--;
    p.burst = Math.min(12, profile.heat + 1);
    p.lastShot = this.time;
    this.fireRay(p, w, profile);
    if (--queued.remaining <= 0) p.queuedBurst = null;
    else queued.next = this.time + w.burstSpacing;
  }
  fireRay(p, w, profile, pellet = 0) {
    const yaw = p.yaw + profile.yaw + (this.random() - 0.5) * profile.spread,
      pitch = p.pitch + profile.pitch + (this.random() - 0.5) * profile.spread;
    let o = [p.x, p.y + (p.input.crouch ? 1.05 : 1.6), p.z],
      d = direction(yaw, pitch),
      dist = w.range ?? 150,
      target = null,
      head = false,
      backstab = false,
      region = null,
      penetration = null;
    for (const q of this.players.values()) {
      if (q === p || !q.alive || q.team === p.team) continue;
      const pose = p.bot
        ? q
        : this.historicalPose(
            q,
            Number.isFinite(p.input.viewTime) ? p.input.viewTime : this.time,
          );
      if (!pose.alive) continue;
      const hit = rayPlayer(o, d, {
        ...pose,
        crouch: p.bot ? !!q.input.crouch : pose.crouch,
      });
      const t = hit.distance;
      if (t < dist) {
        const trace = traceBullet(o, d, t, w);
        if (trace.multiplier <= 0) continue;
        dist = t;
        target = q;
        head = hit.head;
        region = hit.region;
        penetration = trace;
        backstab = p.weapon === "knife" && isBackstab(p, pose);
      }
    }
    let hit = false;
    if (target) {
      this.damage(
        target,
        damageAtDistance(w, dist, region) *
          penetration.multiplier *
          (backstab ? w.backstabScale : 1),
        p,
        head,
        p.weapon,
        region,
      );
      hit = true;
    } else dist = traceBullet(o, d, dist, w).distance;
    this.event("shot", {
      player: p.id,
      pellet,
      weapon: p.weapon,
      alternate: !!profile.alternate,
      backstab,
      from: o,
      to: o.map((v, i) => v + d[i] * dist),
      hit,
      head,
      region,
      penetrated: penetration?.penetrated || 0,
    });
  }
  detonateCore() {
    const core = this.spike;
    if (
      (this.phase !== "live" &&
        !(this.phase === "end" && core?.detonateAt != null)) ||
      !core?.planted ||
      core.detonated ||
      this.time < (core.detonateAt ?? this.end)
    )
      return false;
    core.detonated = true;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const distance = Math.hypot(p.x - core.x, p.z - core.z, p.y);
      const damage =
        CORE_BLAST.damage * Math.max(0, 1 - distance / CORE_BLAST.radius);
      if (damage <= 0) continue;
      const armor = Math.min(p.armor, damage * 0.66),
        health = Math.min(p.hp, damage - armor);
      p.armor -= armor;
      p.hp -= health;
      p.progress = 0;
      p.orbProgress = 0;
      p.orbId = null;
      p.combatReport.push({
        opponent: null,
        name: "코어",
        direction: "in",
        weapon: "코어 폭발",
        region: "environment",
        health,
        armor,
        hits: 1,
      });
      if (p.hp <= 0) {
        this.dropPrimary(p.id, true);
        if (this.phase === "end") p.armor = 0;
        p.alive = false;
        p.deaths++;
        this.awardUltimate(p);
        this.event("kill", {
          killer: "코어",
          victim: p.name,
          head: false,
          weapon: "코어 폭발",
        });
      }
    }
    this.event("detonate", { x: core.x, z: core.z, radius: CORE_BLAST.radius });
    return true;
  }
  finish(team, reason) {
    if (this.phase !== "live") return;
    this.lossStreak[team] = 0;
    this.lossStreak[1 - team] = Math.min(3, this.lossStreak[1 - team] + 1);
    this.score[team]++;
    const stableScore = [0, 0];
    this.teamIds.forEach((id, side) => {
      stableScore[id] = this.score[side];
    });
    this.roundHistory.push({
      round: this.round,
      winner: this.teamIds[team],
      side: team,
      reason,
      score: stableScore,
    });
    this.roundHistory = this.roundHistory.slice(-100);
    this.winner = team;
    if (team === 0 && this.spike?.planted && !this.spike.detonated)
      this.spike.detonateAt = Math.min(this.end, this.time + 4);
    this.phase = "end";
    this.end = this.time + 6;
    for (const p of this.players.values()) {
      p.orbProgress = 0;
      p.orbId = null;
      if (p.awaitingSpawn) continue;
      const base =
        p.team === team ? 3000 : 1900 + 500 * (this.lossStreak[p.team] - 1);
      const plantBonus =
        p.team === 0 && team !== 0 && this.spike?.planted ? 800 : 0;
      p.credits = Math.min(9000, p.credits + base + plantBonus);
      if (!p.alive) {
        p.weapon = "pistol";
        p.primary = null;
        p.armor = 0;
      }
    }
    this.event("result", { team, reason });
  }
  botThink(p) {
    if (!p.alive) return;
    p.input = {};
    if (this.phase === "buy") {
      if (p.credits >= 2900) this.buy(p.id, "rifle");
      if (!p.primary && p.credits >= 1600) this.buy(p.id, "smg");
      if (p.credits >= 1000) this.buy(p.id, "armor");
      else if (p.credits >= 400) this.buy(p.id, "lightArmor");
      this.buy(p.id, "secondary");
      return;
    }
    if (
      this.phase !== "live" &&
      !(
        this.phase === "end" &&
        this.spike?.detonateAt != null &&
        !this.spike.detonated
      )
    )
      return;
    if (p.blindUntil > this.time) return;
    if (p.agent === "haven" && this.phase === "live") {
      if (p.hp < 60) this.ability(p.id);
      if (p.armor < 25) this.ability(p.id, "secondary");
    }
    if (!p.primary) this.pickup(p.id);
    const objective = botObjective(this, p);
    let enemy = [...this.players.values()]
      .filter((q) => q.team !== p.team && q.alive)
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
      )
      .find((q) => seesEnemy(p, q, this.smokes));
    if (enemy && objective.role !== "escape") {
      if (p.botTarget !== enemy.id) {
        p.botTarget = enemy.id;
        p.botSeen = this.time;
      }
      p.yaw = Math.atan2(-(enemy.x - p.x), -(enemy.z - p.z));
      p.pitch = Math.atan2(
        enemy.y + 1.05 - (p.y + 1.6),
        Math.hypot(enemy.x - p.x, enemy.z - p.z),
      );
      const distance = Math.hypot(enemy.x - p.x, enemy.z - p.z);
      if (this.time - p.botSeen > 0.35 && this.time >= p.botSkillAfter) {
        let used = false;
        if (
          p.ultimate >= AGENTS[p.agent].ultimate.points &&
          (p.agent !== "veil" || p.hp < 45)
        ) {
          if (p.agent === "veil") p.yaw += Math.PI;
          used = this.ability(p.id, "ultimate");
          if (p.agent === "veil") p.yaw -= Math.PI;
        } else if (
          p.secondary &&
          ((p.agent === "veil" && distance < 14) ||
            (p.agent === "pulse" && distance < 16) ||
            (p.agent === "dash" && p.hp < 60))
        ) {
          used = this.ability(p.id, "secondary");
        } else if (
          p.skill &&
          ((p.agent === "pulse" && distance < 22) ||
            (p.agent === "veil" && p.hp < 50) ||
            (p.agent === "dash" && p.hp < 40))
        ) {
          used = this.ability(p.id);
        }
        if (used) {
          p.botSkillAfter = this.time + 1.5;
          return;
        }
      }
      p.input.fire =
        this.time - p.botSeen > 0.24 &&
        Math.sin(this.time * 3 + p.botOffset) > -0.3;
      if (WEAPONS[p.weapon].fireMode === "semi")
        p.input.fire &&=
          !p.triggerHeld && this.time - p.lastShot >= WEAPONS[p.weapon].rate;
      if (!p.ammo) this.reload(p.id);
      if (p.reloadUntil) p.input.fire = false;
      if (!p.input.fire && !p.queuedBurst) {
        const preferred =
          Math.sin(this.time * 1.6 + p.botOffset) >= 0 ? "a" : "d";
        for (const side of [preferred, preferred === "a" ? "d" : "a"]) {
          const probe = { ...p };
          move(probe, { [side]: true }, 0.12);
          if (Math.hypot(probe.x - p.x, probe.z - p.z) > 0.2) {
            p.input[side] = true;
            break;
          }
        }
      }
      return;
    }
    if (
      !enemy &&
      objective.role !== "escape" &&
      objective.role !== "defuse" &&
      this.botHeal(p)
    )
      return;
    p.botTarget = null;
    const { target, role, use } = objective;
    p.botRole = role;
    if (
      Math.hypot(target.x - p.x, target.z - p.z) <
      (role === "collect" ? 1.4 : use ? 2.5 : 1.6)
    ) {
      p.input.use = use;
      if (!use) p.yaw = Math.sin(this.time * 0.35 + p.botOffset) * Math.PI;
      return;
    }
    const targetKey =
      role + ":" + Math.round(target.x) + ":" + Math.round(target.z);
    if (p.pathTarget !== targetKey) {
      p.path = null;
      p.pathTarget = targetKey;
    }
    if (!p.path || this.time > (p.pathUntil || 0)) {
      p.path = findPath(p, target);
      p.pathUntil = this.time + 0.8;
    }
    while (
      p.path.length &&
      Math.hypot(p.path[0].x - p.x, p.path[0].z - p.z) < 0.6
    )
      p.path.shift();
    const next = p.path[0];
    if (next) {
      p.yaw = Math.atan2(-(next.x - p.x), -(next.z - p.z));
      p.input.w = true;
    }
  }
  botHeal(p) {
    if (
      p.agent !== "haven" ||
      this.phase !== "live" ||
      !p.alive ||
      this.time < p.botSkillAfter
    )
      return false;
    const allies = [...this.players.values()]
      .filter(
        (q) =>
          q !== p &&
          q.team === p.team &&
          q.alive &&
          q.connected &&
          q.hp <= 60 &&
          Math.hypot(q.x - p.x, q.z - p.z) < 15 &&
          !smokeBlocks(p, q, this.smokes),
      )
      .sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id));
    if (!allies.length) return false;
    const oldYaw = p.yaw,
      oldPitch = p.pitch;
    for (const ally of allies) {
      p.yaw = Math.atan2(-(ally.x - p.x), -(ally.z - p.z));
      p.pitch = Math.atan2(
        ally.y + (ally.input.crouch ? 0.85 : 1.1) - (p.y + 1.6),
        Math.hypot(ally.x - p.x, ally.z - p.z),
      );
      const reachable = allies.filter((q) => {
        const dx = q.x - p.x,
          dz = q.z - p.z,
          len = Math.hypot(dx, dz);
        return (
          len < 0.01 ||
          wallDistance([p.x, 1.3, p.z], [dx / len, 0, dz / len]) >= len
        );
      });
      const wave =
        reachable.length >= 2 &&
        reachable.reduce((n, q) => n + 100 - q.hp, 0) >= 100 &&
        p.ultimate >= AGENTS.haven.ultimate.points;
      if (
        (wave && this.ability(p.id, "ultimate")) ||
        (p.skill && this.ability(p.id))
      ) {
        p.botRole = "heal";
        p.botSkillAfter = this.time + 1.5;
        p.botTarget = null;
        return true;
      }
    }
    p.yaw = oldYaw;
    p.pitch = oldPitch;
    return false;
  }
  tick(dt) {
    this.time += dt;
    this.pings = this.pings.filter((p) => p.end > this.time);
    this.smokes = this.smokes.filter((s) => s.end > this.time);
    if (this.phase === "buy" && this.time >= this.end) {
      this.phase = "live";
      for (const p of this.players.values()) {
        p.requestedWeapon = null;
        p.weaponPurchases = [];
        p.armorPurchase = null;
        p.secondaryPurchases = [];
      }
      this.end = this.time + this.cfg.round;
      this.event("live");
    }
    if (this.phase === "end" && this.time >= this.end) {
      if (this.matchWon()) {
        this.phase = "match";
        this.event("match");
      } else this.nextRound();
    }
    for (const p of this.players.values()) {
      const beforeMove = { x: p.x, y: p.y, z: p.z };
      p.slow = Math.max(0, p.slow - dt);
      if (p.bot) this.botThink(p);
      else {
        this.consumeCommand(p, dt);
        if (this.time - p.lastInput > 0.35) p.input = {};
      }
      if (!p.alive) {
        p.queuedBurst = null;
        continue;
      }
      if (["live", "end"].includes(this.phase)) {
        if (p.bot) {
          move(p, p.input, dt);
          if (p.input.jump && p.y === 0) {
            p.vy = 6;
            p.input.jump = false;
          }
          p.vy -= 18 * dt;
          p.y = Math.max(0, p.y + p.vy * dt);
          if (p.y === 0) p.vy = 0;
        }
      }
      if (beforeMove.y > 0 && p.y === 0 && this.phase === "live")
        p.landingUntil = this.time + 0.18;
      const footstep = movementSound(p, beforeMove, this.phase);
      if (footstep)
        this.event("footstep", {
          player: p.id,
          x: p.x,
          z: p.z,
          kind: footstep,
        });
      const firing =
        !!p.queuedBurst ||
        p.input.fire ||
        p.input.firePressed ||
        p.input.altFire ||
        p.input.altPressed;
      this.trigger(p);
      this.advanceBurst(p);
      if (p.reloadUntil && this.time >= p.reloadUntil) {
        let n = Math.min(WEAPONS[p.weapon].mag - p.ammo, p.reserve);
        p.ammo += n;
        p.reserve -= n;
        p.reloadUntil = 0;
      }
      if (this.phase !== "live") continue;
      let s = this.spike;
      if (s.carrier === p.id) {
        s.x = p.x;
        s.z = p.z;
        this.lastCarrier = { x: p.x, z: p.z };
      }
      if (
        !s.planted &&
        !s.carrier &&
        p.connected &&
        p.team === 0 &&
        Math.hypot(s.x - p.x, s.z - p.z) < 1.5 &&
        (s.droppedBy !== p.id || this.time >= s.pickupAfter)
      )
        s.carrier = p.id;
      let canPlant =
          !s.planted &&
          s.carrier === p.id &&
          MAP.sites.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < 5),
        canDefuse =
          s.planted && p.team === 1 && Math.hypot(s.x - p.x, s.z - p.z) < 3;
      const currentDefuser = this.players.get(s.defuser);
      if (
        s.defuser &&
        (!currentDefuser?.alive ||
          !currentDefuser.connected ||
          !currentDefuser.input.use ||
          currentDefuser.input.fire ||
          currentDefuser.input.altFire ||
          currentDefuser.y > 0 ||
          ["w", "a", "s", "d"].some((k) => currentDefuser.input[k]) ||
          Math.hypot(s.x - currentDefuser.x, s.z - currentDefuser.z) >= 3)
      )
        s.defuser = null;
      if (canDefuse && s.defuser && s.defuser !== p.id) canDefuse = false;
      this.collectOrb(p, dt, canPlant || canDefuse || firing);
      if (
        p.input.use &&
        p.connected &&
        !firing &&
        p.y === 0 &&
        !p.input.w &&
        !p.input.a &&
        !p.input.s &&
        !p.input.d &&
        (canPlant || canDefuse)
      ) {
        if (canDefuse) {
          s.defuser = p.id;
          p.progress = Math.max(p.progress, s.defuseCheckpoint || 0);
        }
        p.progress += dt;
        if (canDefuse && p.progress >= this.cfg.defuse / 2)
          s.defuseCheckpoint = this.cfg.defuse / 2;
        if (
          p.progress + 1e-8 >= (canPlant ? this.cfg.plant : this.cfg.defuse) &&
          this.time <= this.end + 1e-8
        ) {
          if (canPlant) {
            s.planted = true;
            s.carrier = null;
            s.x = p.x;
            s.z = p.z;
            this.end = this.time + this.cfg.fuse;
            this.event("plant", { player: p.name });
            p.credits = Math.min(9000, p.credits + 300);
            this.awardUltimate(p);
          } else {
            this.awardUltimate(p);
            this.finish(1, "코어 해체");
          }
          p.progress = 0;
        }
      } else {
        p.progress = 0;
        if (s.defuser === p.id) s.defuser = null;
      }
    }
    if (this.phase === "end" && this.spike?.detonateAt != null)
      this.detonateCore();
    if (this.phase === "live") {
      let alive = [0, 0],
        total = [0, 0];
      for (const p of this.players.values()) {
        if (p.awaitingSpawn) continue;
        total[p.team]++;
        if (p.alive) alive[p.team]++;
      }
      if (total[1] && alive[1] === 0) this.finish(0, "수비팀 전멸");
      else if (total[0] && alive[0] === 0 && !this.spike.planted)
        this.finish(1, "공격팀 전멸");
      else if (this.time >= this.end) {
        if (this.spike.planted) this.detonateCore();
        this.finish(
          this.spike.planted ? 0 : 1,
          this.spike.planted ? "코어 폭발" : "시간 종료",
        );
      }
    }
    this.recordHistory();
  }
  snapshot(viewerId = null) {
    const viewer = this.players.get(viewerId);
    const state = {
      code: this.code,
      time: this.time,
      phase: this.phase,
      end: this.end,
      round: this.round,
      score: this.score,
      teamIds: [...this.teamIds],
      roundHistory: this.roundHistory.map((row) => ({
        ...row,
        score: [...row.score],
      })),
      orbs: this.orbs.map((orb) => ({ ...orb })),
      economy: {
        nextLossBonus: this.lossStreak.map((n) => 1900 + 500 * Math.min(2, n)),
      },
      owner: this.owner,
      winner: this.winner,
      overtime: this.overtime,
      spike: this.spike,
      smokes: this.smokes,
      pings: this.pings,
      drops: this.drops,
      players: [...this.players.values()].map((p) => {
        const reloadProgress =
          p.reloadUntil > this.time && p.equipUntil <= this.time
            ? Math.max(
                0,
                Math.min(
                  1,
                  1 - (p.reloadUntil - this.time) / WEAPONS[p.weapon].reload,
                ),
              )
            : null;
        const publicState = {
          id: p.id,
          name: p.name,
          team: p.team,
          agent: p.agent,
          bot: p.bot,
          connected: p.connected,
          x: +p.x.toFixed(3),
          z: +p.z.toFixed(3),
          y: +p.y.toFixed(3),
          yaw: +p.yaw.toFixed(4),
          pitch: +p.pitch.toFixed(4),
          alive: p.alive,
          kills: p.kills,
          assists: p.assists,
          deaths: p.deaths,
          weapon: p.weapon,
          reloadProgress,
          revealUntil: p.revealUntil,
          focusUntil: p.focusUntil,
          crouch: !!p.input.crouch,
        };
        // Explicit public fields keep future inventory additions private by default.
        if (viewerId !== null && (!viewer || p.team !== viewer.team))
          return publicState;
        return {
          id: p.id,
          name: p.name,
          team: p.team,
          agent: p.agent,
          bot: p.bot,
          connected: p.connected,
          x: +p.x.toFixed(3),
          z: +p.z.toFixed(3),
          y: +p.y.toFixed(3),
          vy: +p.vy.toFixed(4),
          jumpHeld: p.jumpHeld,
          ack: p.ack,
          yaw: +p.yaw.toFixed(4),
          pitch: +p.pitch.toFixed(4),
          hp: Math.ceil(p.hp),
          awaitingSpawn: p.awaitingSpawn,
          armor: Math.ceil(p.armor),
          alive: p.alive,
          credits: p.credits,
          kills: p.kills,
          assists: p.assists,
          deaths: p.deaths,
          weapon: p.weapon,
          primary: p.primary,
          ammo: p.ammo,
          reserve: p.reserve,
          reloadUntil: p.reloadUntil,
          reloadProgress,
          equipUntil: p.equipUntil,
          requestedWeapon: p.requestedWeapon,
          ...(p.id === viewerId ? { orbProgress: p.orbProgress } : {}),
          ...(p.id === viewerId
            ? {
                refundableWeapon:
                  this.phase === "buy"
                    ? (p.weaponPurchases.at(-1)?.item ?? null)
                    : null,
                refundableArmor:
                  this.phase === "buy" &&
                  !!p.armorPurchase &&
                  p.armor === p.armorPurchase.armor,
                refundableSecondary:
                  this.phase === "buy" ? p.secondaryPurchases.length : 0,
              }
            : {}),
          ...(p.id === viewerId &&
          (!p.alive || this.phase === "end" || this.phase === "match")
            ? { combatReport: p.combatReport.map((row) => ({ ...row })) }
            : {}),
          burst: p.burst,
          lastShot: p.lastShot,
          recoilWeapon: p.recoilWeapon,
          skill: p.skill,
          secondary: p.secondary,
          ultimate: p.ultimate,
          blindUntil: p.blindUntil,
          focusUntil: p.focusUntil,
          progress: +p.progress.toFixed(3),
          slow: p.slow,
          landingUntil: p.landingUntil,
          revealUntil: p.revealUntil,
          crouch: !!p.input.crouch,
        };
      }),
      events: this.events,
    };
    return restrictVisibility(this, state, viewerId);
  }
}
