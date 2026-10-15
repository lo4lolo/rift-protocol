import { wallDistance } from "./shared.mjs";
import { smokeBlocks } from "./tactics.mjs";
import { soundCue } from "./hearing.mjs";

// Conservative omnidirectional visibility: a turn must not wait for a network tick.
export function hasSight(observer, target, smokes = []) {
  if (smokeBlocks(observer, target, smokes)) return false;
  const origin = [
    observer.x,
    (observer.y || 0) + (observer.input?.crouch ? 1.1 : 1.6),
    observer.z,
  ];
  const scale = target.input?.crouch ? 0.73 : 1;
  return [
    [0, 1.7],
    [-0.28, 1.1],
    [0.28, 1.1],
  ].some(([offset, height]) => {
    const delta = [
      target.x + offset - origin[0],
      (target.y || 0) + height * scale - origin[1],
      target.z - origin[2],
    ];
    const distance = Math.hypot(...delta);
    return (
      distance < 0.01 ||
      wallDistance(
        origin,
        delta.map((v) => v / distance),
      ) >= distance
    );
  });
}

export function restrictVisibility(game, state, viewerId) {
  if (viewerId === null) return state;
  const viewer = game.players.get(viewerId);
  const observers = [...game.players.values()].filter(
    (p) =>
      p.team === viewer?.team &&
      p.alive &&
      p.connected &&
      p.blindUntil <= game.time,
  );
  const seen = new Set();
  const canSee = (p) => observers.some((o) => hasSight(o, p, game.smokes));
  const players = state.players.map((p) => {
    if (
      viewer &&
      (p.team === viewer.team ||
        p.revealUntil > game.time ||
        canSee(game.players.get(p.id)))
    ) {
      seen.add(p.id);
      return { ...p, visible: true };
    }
    return {
      id: p.id,
      name: p.name,
      team: p.team,
      agent: p.agent,
      bot: p.bot,
      connected: p.connected,
      alive: p.alive,
      kills: p.kills,
      assists: p.assists,
      deaths: p.deaths,
      visible: false,
    };
  });
  const spike = state.spike;
  const publicSpike = spike ? { ...spike } : null;
  if (publicSpike) {
    delete publicSpike.defuser;
    if (viewer?.team !== 1) delete publicSpike.defuseCheckpoint;
  }
  const coreKnown =
    !spike ||
    spike.planted ||
    viewer?.team === 0 ||
    (spike.carrier ? seen.has(spike.carrier) : canSee(spike));
  const events = state.events.flatMap((e) => {
    if (e.type === "chat") {
      if (!e.recipients.includes(viewerId)) return [];
      const { recipients, ...message } = e;
      return [message];
    }
    if (e.type === "assist") return e.player === viewerId && viewer ? [e] : [];
    if (e.type === "footstep") {
      const cue = soundCue(viewer, e, e, e.kind, e.kind === "land" ? 24 : 20);
      return cue ? [cue] : [];
    }
    if (e.type !== "shot" && e.type !== "skill") return [e];
    const actor = game.players.get(e.player);
    if (actor?.team === viewer?.team) return [e];
    const point =
      e.type === "shot"
        ? { x: e.from[0], y: e.from[1] - 1.6, z: e.from[2] }
        : e;
    if (seen.has(e.player) && canSee(point)) return [e];
    // Preserve nearby gunfire without transmitting hidden muzzle/impact coordinates.
    if (e.type !== "shot" || !viewer?.alive) return [];
    if (e.pellet > 0) return [];
    const cue = soundCue(
      viewer,
      e,
      point,
      e.weapon === "knife" ? "melee" : "shot",
      e.weapon === "knife" ? 8 : 40,
    );
    return cue ? [cue] : [];
  });
  return {
    ...state,
    players,
    orbs: (state.orbs || []).filter((orb) => canSee(orb)),
    pings: (state.pings || []).filter((p) => p.team === viewer?.team),
    events,
    spike: coreKnown
      ? publicSpike
      : { planted: false, hidden: true, carrier: null },
    drops: state.drops.filter((d) => canSee(d)),
  };
}
