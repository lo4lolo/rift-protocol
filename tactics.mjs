import {
  MAP,
  AGENTS,
  CORE_BLAST,
  movementSpeed,
  blocked,
  wallDistance,
  direction,
} from "./shared.mjs";
import { findPath, findEscapePath } from "./navigation.mjs";

function canFinishDefuse(game, p) {
  const core = game.spike;
  const path = findPath(p, core);
  if (!path.length) return false;
  let distance = 0,
    previous = p;
  for (const point of path) {
    distance += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = point;
  }
  const travel = Math.max(0, distance - 2) / movementSpeed(p, {});
  const progress = Math.max(core.defuseCheckpoint || 0, p.progress || 0);
  return game.end - game.time >= travel + game.cfg.defuse - progress + 0.25;
}

function escapeObjective(core, p) {
  if (Math.hypot(p.x - core.x, p.z - core.z) >= CORE_BLAST.radius + 1)
    return { target: { x: p.x, z: p.z }, role: "escape", use: false };
  const path = findEscapePath(p, core, CORE_BLAST.radius + 3);
  return { target: path.at(-1) || p, role: "escape", use: false };
}
export function smokeBlocks(a, b, smokes) {
  const from = [a.x, (a.y || 0) + 1.5, a.z],
    to = [b.x, (b.y || 0) + 1.1, b.z];
  const d = to.map((v, i) => v - from[i]),
    len2 = d.reduce((n, v) => n + v * v, 0);
  return smokes.some((s) => {
    const center = [s.x, 1.5, s.z];
    const t = Math.max(
      0,
      Math.min(
        1,
        center.reduce((n, v, i) => n + (v - from[i]) * d[i], 0) / (len2 || 1),
      ),
    );
    return Math.hypot(...center.map((v, i) => v - from[i] - t * d[i])) < 4.5;
  });
}
export function seesEnemy(p, q, smokes) {
  const dx = q.x - p.x,
    dz = q.z - p.z,
    len = Math.hypot(dx, dz),
    look = direction(p.yaw, 0);
  if (
    len < 0.01 ||
    len > 27 ||
    ((dx * look[0] + dz * look[2]) / len < -0.25 && len > 3)
  )
    return false;
  return (
    wallDistance([p.x, 1.5, p.z], [dx / len, 0, dz / len]) >= len &&
    !smokeBlocks(p, q, smokes)
  );
}
export function botObjective(game, p) {
  const team = [...game.players.values()].filter(
    (q) => q.team === p.team && q.alive,
  );
  const index = team.indexOf(p),
    core = game.spike;
  if (
    !core.planted &&
    core.carrier &&
    core.carrier !== p.id &&
    game.end - game.time > 15
  ) {
    for (const orb of game.orbs || []) {
      if (!orb.available) continue;
      const eligible = team.filter((q) => {
        if (
          !q.connected ||
          q.id === core.carrier ||
          q.ultimate >= AGENTS[q.agent].ultimate.points
        )
          return false;
        const dx = orb.x - q.x,
          dz = orb.z - q.z,
          len = Math.hypot(dx, dz);
        return (
          len < 6 &&
          (len < 0.01 ||
            wallDistance([q.x, 1.5, q.z], [dx / len, 0, dz / len]) >= len) &&
          !smokeBlocks(q, orb, game.smokes)
        );
      });
      const human = eligible.find(
        (q) =>
          !q.bot && q.input.use && Math.hypot(q.x - orb.x, q.z - orb.z) < 2,
      );
      const collector =
        human ||
        eligible
          .filter((q) => q.bot)
          .sort(
            (a, b) =>
              Math.hypot(a.x - orb.x, a.z - orb.z) -
                Math.hypot(b.x - orb.x, b.z - orb.z) ||
              a.id.localeCompare(b.id),
          )[0];
      if (collector === p) return { target: orb, role: "collect", use: true };
    }
  }
  let target, role;
  if (core.planted) {
    const human = team.find(
      (q) =>
        !q.bot && q.progress > 0 && Math.hypot(q.x - core.x, q.z - core.z) < 3,
    );
    const defuser =
      human ||
      team
        .filter((q) => q.bot)
        .sort(
          (a, b) =>
            Math.hypot(a.x - core.x, a.z - core.z) -
              Math.hypot(b.x - core.x, b.z - core.z) ||
            a.id.localeCompare(b.id),
        )[0];
    const remaining = game.end - game.time;
    if (
      (p.team === 0 && remaining < 8) ||
      (p.team === 1 &&
        remaining < 12 &&
        (!defuser || !canFinishDefuse(game, defuser)))
    )
      return escapeObjective(core, p);
    if (p.team === 1 && defuser === p)
      return { target: core, role: "defuse", use: true };
    role = p.team === 0 ? "hold" : "cover";
    const offsets = [
      [-4, 4],
      [4, 4],
      [-4, -4],
      [4, -4],
      [0, 6],
    ];
    const [dx, dz] = offsets[Math.max(0, index) % offsets.length];
    target = { x: core.x + dx, z: core.z + dz };
    if (blocked(target.x, target.z, 0.7)) target = { x: core.x, z: core.z + 5 };
  } else if (p.team === 0) {
    if (!core.carrier) return { target: core, role: "recover", use: false };
    const carrier = game.players.get(core.carrier);
    const nearest =
      carrier &&
      MAP.sites.find((s) => Math.hypot(s.x - carrier.x, s.z - carrier.z) < 14);
    const site = nearest || MAP.sites[(game.round - 1) % 2];
    if (core.carrier === p.id)
      return { target: site, role: "plant", use: true };
    target =
      index === team.length - 1 && team.length >= 4
        ? MAP.sites[1 - MAP.sites.indexOf(site)]
        : { x: site.x, z: site.z + 4 + (index % 2) * 2 };
    role = index === team.length - 1 && team.length >= 4 ? "flank" : "escort";
  } else {
    target = MAP.sites[index % 2];
    role = "guard";
  }
  return { target, role, use: false };
}
