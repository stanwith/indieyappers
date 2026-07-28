// Self-check for the reducer's window toggle. It lives here rather than in the puppeteer flow
// because the checked-in data has identical 7d and 30d orderings (no activity snapshots locally),
// so a browser run can't tell "follows the person" from "follows the row" at any index.
// Run: npm run test
import assert from 'node:assert/strict'
import { setArcadeData, type Entry } from './data/leaderboard'
import { reduce, type ArcadeState, type Phase } from './state'

const entry = (rank: number, handle: string): Entry => ({
  rank,
  handle,
  name: handle.toUpperCase(),
  product: '',
  companyName: '',
  blurb: null,
  followers: 0,
  postsTotal: 0,
  yapScore: 0,
  interactions: 0,
  impressions: 0,
  rankDelta: 0,
  avatar: null,
  stale: false,
})

const board = (handles: string[]) => handles.map((h, i) => entry(i + 1, h))

function setup(w7: string[], w30: string[]) {
  setArcadeData({ capturedAt: '', windows: { '7d': board(w7), '30d': board(w30) }, user: null })
}

const state = (over: Partial<ArcadeState> = {}): ArcadeState => ({
  phase: 'leaderboard',
  win: '7d',
  cursor: 0,
  query: null,
  ...over,
})

const toggled = (s: ArcadeState) => reduce(s, { t: 'TOGGLE_WINDOW' })

// the point of the change: same person, different row
setup(['ann', 'bob', 'cal'], ['cal', 'ann', 'bob'])
{
  const after = toggled(state({ cursor: 1 })) // on 'bob', index 1 of 7d
  assert.equal(after.win, '30d')
  assert.equal(after.cursor, 2, "cursor should land on bob's 30d row (2), not stay at 1")
}

// round-trips
{
  const there = toggled(state({ cursor: 1 }))
  assert.deepEqual(toggled(there), state({ cursor: 1 }), 'toggling back returns the original state')
}

// both phases, since TOGGLE_WINDOW is reachable from the detail screen too — that path used to
// swap you onto a different person's profile
for (const phase of ['leaderboard', 'detail'] as Phase[]) {
  assert.equal(toggled(state({ phase, cursor: 0 })).cursor, 1, `${phase}: ann 0 -> 1`)
  assert.equal(toggled(state({ phase, cursor: 2 })).cursor, 0, `${phase}: cal 2 -> 0`)
}

// missing from the other window (a sign-up with no 30d activity): clamp, don't crash or reset
setup(['ann', 'bob', 'cal'], ['ann'])
assert.equal(toggled(state({ cursor: 2 })).cursor, 0, 'clamps into the shorter window')

// empty other window
setup(['ann'], [])
assert.equal(toggled(state({ cursor: 0 })).cursor, 0, 'survives an empty window')

// a query filters both windows, and follow still works against the filtered lists
setup(['ann', 'bob', 'cal'], ['cal', 'ann', 'bob'])
{
  // 'a' matches ann and cal (name contains A) -> 7d [ann, cal], 30d [cal, ann]
  const after = toggled(state({ cursor: 0, query: 'a' }))
  assert.equal(after.cursor, 1, 'follows ann to index 1 of the filtered 30d list')
}

// empty board at all: cursor stays put rather than going NaN
setup([], [])
assert.equal(toggled(state({ cursor: 0 })).cursor, 0, 'survives an empty board')

console.log('state.test.ts: all assertions passed')
