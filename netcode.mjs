import { move, buyBarrier } from "./shared.mjs";

export const INPUT_DT = 1 / 30;
export const INTERPOLATION_DELAY = 0.1;
export const MAX_REWIND = 0.25;

// One command always represents two fixed physics steps. Client duration is never trusted.
export function simulateCommand(p, command, phase = "live") {
  p.yaw = command.yaw;
  p.pitch = command.pitch;
  for (let i = 0; i < 2; i++) {
    move(p, command, 1 / 60);
    if (phase === "buy") buyBarrier(p);
    if (command.jump && !p.jumpHeld && p.y === 0) p.vy = 6;
    p.jumpHeld = !!command.jump;
    p.vy = (p.vy || 0) - 18 / 60;
    p.y = Math.max(0, (p.y || 0) + p.vy / 60);
    if (p.y === 0) p.vy = 0;
  }
  return p;
}
export function motionState(p) {
  return {
    x: p.x,
    team: p.team,
    weapon: p.weapon,
    z: p.z,
    y: p.y,
    vy: p.vy,
    yaw: p.yaw,
    pitch: p.pitch,
    jumpHeld: !!p.jumpHeld,
    slow: p.slow || 0,
  };
}
export function reconcile(authoritative, pending, phase = "live") {
  const remaining = pending.filter((c) => c.seq > authoritative.ack);
  const predicted = motionState(authoritative);
  if (authoritative.alive)
    for (const command of remaining) simulateCommand(predicted, command, phase);
  return { predicted, pending: remaining };
}
export function interpolatePose(a, b, t) {
  if (b?.visible === false) return b;
  if (a?.visible === false) return b || a;
  if (!a) return b;
  if (!b) return a;
  const f = Math.max(0, Math.min(1, t));
  // A teleport, spawn or death must not sweep a model through solid walls.
  if (a.alive !== b.alive || Math.hypot(b.x - a.x, b.z - a.z) > 3)
    return f < 1 ? a : b;
  const full = Math.PI * 2;
  const angle = ((((b.yaw - a.yaw + Math.PI) % full) + full) % full) - Math.PI;
  return {
    ...b,
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    y: a.y + (b.y - a.y) * f,
    yaw: a.yaw + angle * f,
    pitch: a.pitch + (b.pitch - a.pitch) * f,
  };
}
export class SnapshotBuffer {
  constructor() {
    this.samples = [];
  }
  clear() {
    this.samples = [];
  }
  push(state) {
    if (this.samples.length && state.round !== this.samples.at(-1).round)
      this.clear();
    this.samples.push(state);
    if (this.samples.length > 20) this.samples.shift();
  }
  pose(id, time) {
    const latest = this.samples.at(-1)?.players.find((p) => p.id === id);
    if (latest?.visible === false) return latest;
    let a = this.samples[0],
      b = a;
    for (const s of this.samples) {
      if (s.time <= time) a = s;
      if (s.time >= time) {
        b = s;
        break;
      }
      b = s;
    }
    if (!a) return null;
    const p = a.players.find((p) => p.id === id),
      q = b.players.find((p) => p.id === id);
    return interpolatePose(
      p,
      q,
      b.time === a.time ? 1 : (time - a.time) / (b.time - a.time),
    );
  }
}
