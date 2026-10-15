import { blocked } from "./shared.mjs";
const STEP = 2,
  MIN = -28,
  SIZE = 29;
const point = (i) => ({
  x: MIN + (i % SIZE) * STEP,
  z: MIN + Math.floor(i / SIZE) * STEP,
});
const index = (x, z) =>
  Math.round((z - MIN) / STEP) * SIZE + Math.round((x - MIN) / STEP);
const walkable = new Set(
  Array.from({ length: SIZE * SIZE }, (_, i) => i).filter((i) => {
    const p = point(i);
    return !blocked(p.x, p.z, 0.7);
  }),
);
function nearest(x, z) {
  let best = null,
    dist = Infinity;
  for (const i of walkable) {
    const p = point(i),
      d = Math.hypot(p.x - x, p.z - z);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}
export function findPath(from, to, accept = null) {
  const start = nearest(from.x, from.z),
    destination = accept ? null : nearest(to.x, to.z);
  let end = destination;
  if (start === null || (!accept && end === null)) return [];
  const queue = [start],
    previous = new Map([[start, null]]);
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (accept?.(point(i))) end = i;
    if (i === end) break;
    const p = point(i);
    for (const [dx, dz] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      const x = p.x + dx,
        z = p.z + dz;
      if (x < MIN || x > 28 || z < MIN || z > 28) continue;
      const n = index(x, z);
      if (
        !walkable.has(n) ||
        previous.has(n) ||
        blocked((x + p.x) / 2, (z + p.z) / 2, 0.7)
      )
        continue;
      previous.set(n, i);
      queue.push(n);
    }
  }
  if (!previous.has(end)) return [];
  const path = [];
  for (let i = end; i !== null; i = previous.get(i)) path.push(point(i));
  path.reverse();
  return path;
}

export function findEscapePath(from, danger, radius) {
  return findPath(
    from,
    danger,
    (p) => Math.hypot(p.x - danger.x, p.z - danger.z) >= radius,
  );
}
