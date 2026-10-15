export function soundCue(listener, event, point, kind, range) {
  if (!listener?.alive || !listener.connected) return null;
  const dx = point.x - listener.x,
    dz = point.z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= range) return null;
  const right =
    distance < 0.01
      ? 0
      : (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / distance;
  return {
    id: event.id,
    time: event.time,
    type: "sound",
    kind,
    level: distance < range / 3 ? 3 : distance < (range * 2) / 3 ? 2 : 1,
    pan: Math.round(right * 2) / 2,
  };
}

export function movementSound(player, before, phase) {
  const distance = Math.hypot(player.x - before.x, player.z - before.z);
  if (phase !== "live" || !player.alive || !player.connected || distance > 2) {
    player.stepDistance = 0;
    return null;
  }
  if (before.y > 0 && player.y === 0) {
    player.stepDistance = 0;
    return "land";
  }
  if (player.y > 0 || player.input.walk || player.input.crouch) {
    player.stepDistance = 0;
    return null;
  }
  player.stepDistance = (player.stepDistance || 0) + distance;
  if (player.stepDistance < 1.7) return null;
  player.stepDistance %= 1.7;
  return "step";
}
