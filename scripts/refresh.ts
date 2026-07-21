/**
 * Pulls live data from the X API for every founder and writes one activity
 * snapshot per founder. Run via `npm run refresh` (requires X_BEARER_TOKEN
 * in .env.local).
 */
import { getDb } from "../lib/db";
import {
  getUsersByHandles,
  getUserTweetsSince,
  classifyTweet,
  tweetInteractions,
  tweetImpressions,
  type XUser,
} from "../lib/x-api";
import type { FounderRow } from "../lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const db = getDb();
  let founders = db.prepare("SELECT * FROM founders").all() as FounderRow[];

  // Optional: `npm run refresh -- handle1 handle2` refreshes only those.
  const only = process.argv.slice(2).map((h) => h.replace(/^@/, "").toLowerCase());
  if (only.length > 0) {
    founders = founders.filter((f) => only.includes(f.handle.toLowerCase()));
  }
  console.log(`Refreshing ${founders.length} founders...`);

  console.log("Resolving profiles (users/by)...");
  const users = await getUsersByHandles(founders.map((f) => f.handle));
  const byHandle = new Map<string, XUser>(
    users.map((u) => [u.username.toLowerCase(), u])
  );

  const now = new Date().toISOString();
  const updateProfile = db.prepare(`
    UPDATE founders SET
      x_user_id = ?, avatar_url = ?, followers = ?,
      lifetime_tweet_count = ?, profile_updated_at = ?
    WHERE handle = ?
  `);
  for (const f of founders) {
    const u = byHandle.get(f.handle.toLowerCase());
    if (!u) {
      console.warn(`  could not resolve @${f.handle} (renamed/suspended?)`);
      continue;
    }
    updateProfile.run(
      u.id,
      // _normal is 48x48; strip the suffix for the full-size image
      u.profile_image_url?.replace("_normal", "") ?? null,
      u.public_metrics?.followers_count ?? null,
      u.public_metrics?.tweet_count ?? null,
      now,
      f.handle
    );
  }

  const insertSnapshot = db.prepare(`
    INSERT INTO activity_snapshots (
      handle, captured_at, followers, lifetime_tweet_count,
      posts_7d_original, posts_7d_reply, posts_7d_retweet,
      posts_30d_original, posts_30d_reply, posts_30d_retweet,
      interactions_7d, interactions_30d, impressions_7d, impressions_30d
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const start30 = new Date(Date.now() - 30 * DAY_MS);
  const cutoff7 = Date.now() - 7 * DAY_MS;

  let done = 0;
  for (const f of founders) {
    const u = byHandle.get(f.handle.toLowerCase());
    if (!u) continue;

    const tweets = await getUserTweetsSince(u.id, start30);
    const counts = {
      "7d": { original: 0, reply: 0, retweet: 0, interactions: 0, impressions: 0 },
      "30d": { original: 0, reply: 0, retweet: 0, interactions: 0, impressions: 0 },
    };
    for (const t of tweets) {
      const kind = classifyTweet(t);
      counts["30d"][kind]++;
      counts["30d"].interactions += tweetInteractions(t);
      counts["30d"].impressions += tweetImpressions(t);
      if (new Date(t.created_at).getTime() >= cutoff7) {
        counts["7d"][kind]++;
        counts["7d"].interactions += tweetInteractions(t);
        counts["7d"].impressions += tweetImpressions(t);
      }
    }

    insertSnapshot.run(
      f.handle,
      now,
      u.public_metrics?.followers_count ?? null,
      u.public_metrics?.tweet_count ?? null,
      counts["7d"].original,
      counts["7d"].reply,
      counts["7d"].retweet,
      counts["30d"].original,
      counts["30d"].reply,
      counts["30d"].retweet,
      counts["7d"].interactions,
      counts["30d"].interactions,
      counts["7d"].impressions,
      counts["30d"].impressions
    );

    done++;
    console.log(
      `  [${done}/${founders.length}] @${f.handle}: ${tweets.length} posts in 30d`
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
