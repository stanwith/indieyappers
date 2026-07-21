/**
 * Seeds the database with realistic fake activity so the dashboard is fully
 * reviewable without an X API token. Run via `npm run mock`.
 * Writes two snapshots (yesterday + today) so trend stats light up too.
 */
import { getDb } from "../lib/db";
import type { FounderRow } from "../lib/types";

// Deterministic PRNG so mock output is stable across runs.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const db = getDb();
const founders = db.prepare("SELECT * FROM founders").all() as FounderRow[];

const updateProfile = db.prepare(`
  UPDATE founders SET followers = ?, lifetime_tweet_count = ?, profile_updated_at = ?
  WHERE handle = ?
`);
const insertSnapshot = db.prepare(`
  INSERT INTO activity_snapshots (
    handle, captured_at, followers, lifetime_tweet_count,
    posts_7d_original, posts_7d_reply, posts_7d_retweet,
    posts_30d_original, posts_30d_reply, posts_30d_retweet,
    interactions_7d, interactions_30d, impressions_7d, impressions_30d
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.prepare("DELETE FROM activity_snapshots").run();

const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

for (const f of founders) {
  const rand = mulberry32(
    [...f.handle].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)
  );
  const followers = f.approx_followers ?? 10_000;

  // Posting intensity is only loosely related to audience size.
  const intensity = 0.3 + rand() * 2.7;
  const lifetime = Math.round(5_000 + rand() * 120_000);

  updateProfile.run(followers, lifetime, now.toISOString(), f.handle);

  for (const [i, ts] of [yesterday, now].entries()) {
    const drift = i === 0 ? 0.85 + rand() * 0.2 : 1;
    const perDayOriginal = intensity * (1 + rand() * 2) * drift;
    const perDayReply = intensity * rand() * 6 * drift;
    const perDayRetweet = intensity * rand() * 1.5 * drift;

    const o7 = Math.round(perDayOriginal * 7);
    const r7 = Math.round(perDayReply * 7);
    const rt7 = Math.round(perDayRetweet * 7);
    const posts7 = o7 + r7 + rt7;

    // Impressions scale with audience and volume; interactions are a slice of that.
    const reach = followers * (0.15 + rand() * 0.55);
    const imp7 = Math.round(posts7 * reach * (0.08 + rand() * 0.25) * drift);
    const int7 = Math.round(imp7 * (0.008 + rand() * 0.03));
    const windowScale = 3.6 + rand() * 0.8;

    insertSnapshot.run(
      f.handle,
      ts.toISOString(),
      followers,
      lifetime,
      o7,
      r7,
      rt7,
      Math.round(o7 * windowScale),
      Math.round(r7 * windowScale),
      Math.round(rt7 * windowScale),
      int7,
      Math.round(int7 * windowScale),
      imp7,
      Math.round(imp7 * windowScale)
    );
  }
}

console.log(`Seeded mock snapshots for ${founders.length} founders.`);
