import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
import { AssistNotice } from "../public/notifications.mjs";
test("assist detail is delivered only to the helper, with combined contribution once", () => {
  const g = new Game("NOTICE"),
    a = g.add("a", "A"),
    b = g.add("b", "B"),
    c = g.add("c", "C");
  g.start(a.id);
  g.phase = "live";
  c.agent = "pulse";
  c.x = b.x;
  c.z = b.z;
  g.ability(c.id);
  g.damage(b, 50, c);
  g.damage(b, 500, a);
  const events = (viewer) =>
    g.snapshot(viewer).events.filter((e) => e.type === "assist");
  assert.equal(events(c.id).length, 1);
  assert.equal(events(c.id)[0].damage, true);
  assert.equal(events(c.id)[0].utility, true);
  for (const viewer of [a.id, b.id, "unknown"])
    assert.deepEqual(events(viewer), []);
  g.damage(b, 500, a);
  assert.equal(events(c.id).length, 1);
});
test("notice skips initial history, expires without repeat, clears on round change and reconnect", () => {
  const n = new AssistNotice();
  const e = { id: 2, type: "assist", player: "c", round: 1, time: 10 };
  const s = { events: [{ ...e, id: 1 }], round: 1, time: 10 };
  assert.equal(n.update(s, "c"), null);
  s.events.push(e);
  assert.equal(n.update(s, "c"), e);
  s.time = 12;
  assert.equal(n.update(s, "c"), e);
  s.time = 13;
  assert.equal(n.update(s, "c"), null);
  s.events.push({ ...e, id: 3, time: 13 });
  assert.ok(n.update(s, "c"));
  s.round = 2;
  assert.equal(n.update(s, "c"), null);
  assert.equal(new AssistNotice().update({ ...s, round: 1 }, "c"), null);
});
