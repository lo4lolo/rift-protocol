import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../game.mjs";
function setup() {
  const g = new Game("HISTORY");
  g.add("a", "A");
  g.add("b", "B");
  g.start("a");
  return g;
}
test("history records one completed round with immutable score and no combat secrets", () => {
  const g = setup();
  g.phase = "live";
  g.finish(0, "코어 폭발");
  g.finish(1, "duplicate");
  assert.deepEqual(g.roundHistory, [
    { round: 1, winner: 0, side: 0, reason: "코어 폭발", score: [1, 0] },
  ]);
  const s = g.snapshot("a");
  s.roundHistory[0].score[0] = 99;
  assert.equal(g.roundHistory[0].score[0], 1);
  g.nextRound();
  g.phase = "live";
  g.finish(1, "코어 해체");
  assert.deepEqual(g.roundHistory[0].score, [1, 0]);
  assert.deepEqual(g.roundHistory[1].score, [1, 1]);
  assert.deepEqual(g.snapshot("b").roundHistory, g.snapshot("a").roundHistory);
});
test("team identity and historical winner stay stable across halftime and overtime", () => {
  const g = setup();
  g.overtime = true;
  for (let round = 1; round <= 26; round++) {
    g.phase = "live";
    const side = g.players.get("a").team;
    assert.equal(g.teamIds[side], 0);
    g.finish(side, "전멸");
    const result = g.roundHistory.at(-1);
    assert.equal(result.winner, 0);
    assert.deepEqual(result.score, [round, 0]);
    if (round < 26) g.nextRound();
  }
  assert.ok(g.roundHistory.every((row) => row.winner === 0));
});
test("new matches and lobby clear previous match history; retention is bounded", () => {
  const g = setup();
  for (let i = 0; i < 105; i++) {
    g.phase = "live";
    g.finish(0, "시간 종료");
    g.nextRound();
  }
  assert.equal(g.roundHistory.length, 100);
  g.phase = "match";
  g.start("a");
  assert.deepEqual(g.roundHistory, []);
  assert.deepEqual(g.teamIds, [0, 1]);
  g.phase = "live";
  g.finish(0, "전멸");
  g.phase = "match";
  g.returnToLobby("a");
  assert.deepEqual(g.roundHistory, []);
});
