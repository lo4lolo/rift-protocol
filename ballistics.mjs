import { MAP } from "./shared.mjs";
export function isBackstab(attacker, target) {
  const dx = target.x - attacker.x,
    dz = target.z - attacker.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.01 || !Number.isFinite(target.yaw)) return false;
  return (
    (-Math.sin(target.yaw) * dx - Math.cos(target.yaw) * dz) / distance > 0.5
  );
}
export function damageAtDistance(weapon, distance, region = "body") {
  const base =
    region === "head"
      ? weapon.head
      : weapon.damage * (region === "legs" ? (weapon.legScale ?? 0.85) : 1);
  const scale =
    (weapon.falloff || [[Infinity, 1]]).find(([end]) => distance <= end)?.[1] ??
    1;
  return base * scale;
}
export function rayInterval(origin, direction, min, max) {
  let near = 0,
    far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(direction[i]) < 1e-8) {
      if (origin[i] < min[i] || origin[i] > max[i]) return null;
      continue;
    }
    let a = (min[i] - origin[i]) / direction[i],
      b = (max[i] - origin[i]) / direction[i];
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return null;
  }
  return { near, far };
}
// Low crates are penetrable wood/composite; tall architecture is solid masonry.
// Values are original prototype tuning, not extracted game data.
export function traceBullet(
  origin,
  direction,
  distance,
  weapon,
  walls = MAP.walls,
) {
  const hits = [];
  for (const [x, z, width, depth, height, material] of walls) {
    const interval = rayInterval(
      origin,
      direction,
      [x - width / 2, 0, z - depth / 2],
      [x + width / 2, height, z + depth / 2],
    );
    if (interval && interval.near < distance && interval.far > 0)
      hits.push({
        ...interval,
        penetrable: material === "wood" || (!material && height <= 3),
      });
  }
  hits.sort((a, b) => a.near - b.near);
  const budget = weapon.penetration || 0;
  let spent = 0,
    count = 0;
  for (const h of hits) {
    if (!h.penetrable || !budget)
      return { distance: h.near, multiplier: 0, penetrated: count };
    const thickness = Math.min(distance, h.far) - h.near;
    if (thickness <= 1e-6) continue;
    if (spent + thickness > budget)
      return {
        distance: h.near + Math.max(0, budget - spent),
        multiplier: 0,
        penetrated: count,
      };
    spent += thickness;
    count++;
  }
  return {
    distance,
    multiplier: budget ? Math.max(0.2, 1 - (0.75 * spent) / budget) : 1,
    penetrated: count,
  };
}
