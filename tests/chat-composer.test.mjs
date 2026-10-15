import test from "node:test";
import assert from "node:assert/strict";
import { ChatComposer } from "../public/notifications.mjs";
test("IME commit does not submit and pending request prevents duplicate sends", () => {
  const c = new ChatComposer();
  c.composition(true, 0);
  assert.equal(c.begin("안녕", true, 10), null);
  c.composition(false, 20);
  assert.equal(c.begin("안녕", true, 21), null);
  const sent = c.begin("안녕", true, 80);
  assert.equal(sent.text, "안녕");
  assert.equal(c.begin("다른 내용", true, 90), null);
  assert.equal(c.acknowledge(sent.requestId + 1, true), null);
  assert.deepEqual(c.acknowledge(sent.requestId, false), {
    accepted: false,
    text: "안녕",
  });
  assert.ok(c.begin("안녕", true, 100));
});
test("disconnection and empty input preserve draft; matching success identifies exact submitted text", () => {
  const c = new ChatComposer();
  assert.equal(c.begin("  ", true, 100), null);
  assert.equal(c.begin("보관", false, 100), null);
  const sent = c.begin("  보관  ", true, 100);
  assert.deepEqual(c.acknowledge(sent.requestId, true), {
    accepted: true,
    text: "보관",
  });
  assert.equal(c.acknowledge(sent.requestId, true), null);
  assert.equal(c.pending, null);
});
