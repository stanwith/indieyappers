// Self-check for the staleness predicate. It decides whether a founder's zero
// is real or just an unpollable account (protected, renamed, suspended), so
// getting it wrong either ranks a fake zero or blanks the whole board.
// Run: npm run test
import assert from "node:assert/strict";
import { isStale } from "./leaderboard";

const run = "2026-07-28T05:00:00.000Z";

// Polled in the latest run.
assert.equal(isStale(run, run), false);

// Skipped one night: 24h behind is still inside the 36h tolerance, so its 7d
// window is only a day off — not worth blanking.
assert.equal(isStale("2026-07-27T05:00:00.000Z", run), false);

// Skipped two nights running: the numbers no longer describe the window.
assert.equal(isStale("2026-07-26T05:00:00.000Z", run), true);

// Never successfully polled at all.
assert.equal(isStale(null, run), true);

// Pre-migration snapshot, where no founder has a fetch timestamp yet. Nothing
// to compare against, so trust the data rather than blanking every row.
assert.equal(isStale(null, null), false);

console.log("leaderboard: staleness predicate ok");
