// A fresh connection starts from its first snapshot, never replays old notices.
export class ChatComposer {
  composing = false;
  readyAt = 0;
  sequence = 0;
  pending = null;
  composition(active, now) {
    this.composing = active;
    if (!active) this.readyAt = now + 50;
  }
  begin(text, connected, now) {
    if (
      !connected ||
      this.composing ||
      now < this.readyAt ||
      this.pending ||
      !text.trim()
    )
      return null;
    this.pending = {
      type: "chat",
      requestId: ++this.sequence,
      text: text.trim().slice(0, 200),
    };
    return this.pending;
  }
  acknowledge(id, accepted) {
    if (id !== this.pending?.requestId) return null;
    const result = { accepted, text: this.pending.text };
    this.pending = null;
    return result;
  }
}
export class AssistNotice {
  constructor() {
    this.cursor = null;
    this.latest = null;
  }
  update(state, playerId) {
    const events = state.events || [];
    const cursor = Math.max(this.cursor || 0, ...events.map((e) => e.id));
    if (this.cursor !== null) {
      for (const e of events) {
        if (
          e.id > this.cursor &&
          e.type === "assist" &&
          e.player === playerId &&
          e.round === state.round
        )
          this.latest = e;
      }
    }
    this.cursor = cursor;
    if (
      this.latest &&
      (this.latest.round !== state.round || state.time - this.latest.time >= 3)
    )
      this.latest = null;
    return this.latest;
  }
}
