/**
 * Pulls live data from the X API and snapshots the leaderboard.
 *
 * Cost-aware design: every fetched post is stored in the `tweets` table, and
 * later runs fetch incrementally (since_id), so only NEW posts are billed.
 * All window aggregates (7d/30d counts, interactions, impressions) and the
 * top-posts cache are computed from stored tweets.
 *
 * Usage:
 *   npm run refresh                 # incremental refresh of everyone
 *   npm run refresh -- @handle ...  # only those handles
 *   npm run refresh -- --repoll     # also re-fetch metrics for posts from
 *                                   # the last 3 days (engagement matures)
 */
import { getDb } from "../lib/db";
import { pgConfigured, pgListJoinedFounders } from "../lib/pgstore";
import {
  getUsersByHandles,
  getUserTweetsSince,
  getTweetsByIds,
  classifyTweet,
  type XUser,
} from "../lib/x-api";
import type { FounderRow } from "../lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const REPOLL_DAYS = 3;

/**
 * Adopt sign-ups from the shared Postgres store into the local pipeline so
 * the nightly refresh tracks them like any seed founder from then on.
 */
async function adoptSignups(db: ReturnType<typeof getDb>) {
  if (!pgConfigured()) return;
  const joined = await pgListJoinedFounders();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO founders (
      handle, name, product, tier, tier_label, approx_followers, notes,
      x_user_id, avatar_url, followers, joined_via_x
    ) VALUES (?, ?, '', 4, '4 - Rising (<10K)', ?, 'Joined via sign in with X', ?, ?, ?, 1)
  `);
  let adopted = 0;
  for (const j of joined) {
    const res = insert.run(
      j.handle,
      j.name,
      j.followers,
      j.x_user_id,
      j.avatar_url,
      j.followers
    );
    adopted += res.changes;
  }
  if (adopted > 0) console.log(`Adopted ${adopted} new sign-ups into the pipeline.`);
}

async function main() {
  const db = getDb();
  await adoptSignups(db);
  let founders = db.prepare("SELECT * FROM founders").all() as FounderRow[];

  const args = process.argv.slice(2);
  const repoll = args.includes("--repoll");
  const only = args
    .filter((a) => !a.startsWith("--"))
    .map((h) => h.replace(/^@/, "").toLowerCase());
  if (only.length > 0) {
    founders = founders.filter((f) => only.includes(f.handle.toLowerCase()));
  }
  console.log(`Refreshing ${founders.length} founders${repoll ? " (with metric repoll)" : ""}...`);

  console.log("Resolving profiles (users/by)...");
  const users = await getUsersByHandles(founders.map((f) => f.handle));
  const byHandle = new Map<string, XUser>(
    users.map((u) => [u.username.toLowerCase(), u])
  );

  const now = new Date().toISOString();
  const updateProfile = db.prepare(`
    UPDATE founders SET
      x_user_id = ?, avatar_url = ?, banner_url = ?, followers = ?,
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
      u.profile_image_url?.replace("_normal", "") ?? null,
      u.profile_banner_url ? `${u.profile_banner_url}/1500x500` : null,
      u.public_metrics?.followers_count ?? null,
      u.public_metrics?.tweet_count ?? null,
      now,
      f.handle
    );
  }

  const upsertTweet = db.prepare(`
    INSERT OR REPLACE INTO tweets (
      tweet_id, handle, kind, text, created_at,
      likes, retweets, replies, quotes, impressions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const latestTweetId = db.prepare(
    `SELECT tweet_id FROM tweets WHERE handle = ?
     ORDER BY LENGTH(tweet_id) DESC, tweet_id DESC LIMIT 1`
  );

  const start30 = new Date(Date.now() - 30 * DAY_MS);

  let done = 0;
  let fetched = 0;
  for (const f of founders) {
    const u = byHandle.get(f.handle.toLowerCase());
    if (!u) continue;

    const since = latestTweetId.get(f.handle) as { tweet_id: string } | undefined;
    let tweets;
    try {
      tweets = await getUserTweetsSince(
        u.id,
        since ? { sinceId: since.tweet_id } : { startTime: start30 }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("credits-depleted") || message.includes("402")) {
        console.error(
          `\nStopping: X API credits depleted after ${done} founders. ` +
            "Top up credits and re-run; progress is kept."
        );
        break;
      }
      console.warn(`  @${f.handle} tweets fetch failed, skipping:`, message);
      continue;
    }

    for (const t of tweets) {
      upsertTweet.run(
        t.id,
        f.handle,
        classifyTweet(t),
        t.text ?? "",
        t.created_at,
        t.public_metrics?.like_count ?? 0,
        t.public_metrics?.retweet_count ?? 0,
        t.public_metrics?.reply_count ?? 0,
        t.public_metrics?.quote_count ?? 0,
        t.public_metrics?.impression_count ?? 0
      );
    }

    fetched += tweets.length;
    done++;
    console.log(
      `  [${done}/${founders.length}] @${f.handle}: +${tweets.length} new posts`
    );
  }

  if (repoll) {
    const cutoff = new Date(Date.now() - REPOLL_DAYS * DAY_MS).toISOString();
    const ids = (
      db
        .prepare("SELECT tweet_id FROM tweets WHERE created_at >= ?")
        .all(cutoff) as { tweet_id: string }[]
    ).map((r) => r.tweet_id);
    console.log(`Repolling metrics for ${ids.length} recent posts...`);
    try {
      const fresh = await getTweetsByIds(ids);
      const updateMetrics = db.prepare(
        `UPDATE tweets SET likes = ?, retweets = ?, replies = ?, quotes = ?, impressions = ?
         WHERE tweet_id = ?`
      );
      for (const t of fresh) {
        updateMetrics.run(
          t.public_metrics?.like_count ?? 0,
          t.public_metrics?.retweet_count ?? 0,
          t.public_metrics?.reply_count ?? 0,
          t.public_metrics?.quote_count ?? 0,
          t.public_metrics?.impression_count ?? 0,
          t.id
        );
      }
    } catch (err) {
      console.warn("  repoll failed:", err instanceof Error ? err.message : err);
    }
  }

  // Snapshot every founder from stored tweets.
  console.log("Computing snapshots from stored posts...");
  const insertSnapshot = db.prepare(`
    INSERT INTO activity_snapshots (
      handle, captured_at, followers, lifetime_tweet_count,
      posts_7d_original, posts_7d_reply, posts_7d_retweet,
      posts_30d_original, posts_30d_reply, posts_30d_retweet,
      interactions_7d, interactions_30d, impressions_7d, impressions_30d
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const aggregate = db.prepare(`
    SELECT kind, COUNT(*) AS n,
           SUM(likes + retweets + replies + quotes) AS inter,
           SUM(impressions) AS imp
    FROM tweets WHERE handle = ? AND created_at >= ?
    GROUP BY kind
  `);
  const deleteTopTweets = db.prepare("DELETE FROM top_tweets WHERE handle = ?");
  const rebuildTopTweets = db.prepare(`
    INSERT INTO top_tweets (handle, tweet_id, text, created_at, likes, retweets, replies, impressions)
    SELECT handle, tweet_id, text, created_at, likes, retweets, replies, impressions
    FROM tweets
    WHERE handle = ? AND kind = 'original' AND created_at >= ?
    ORDER BY (likes + retweets + replies + quotes) DESC
    LIMIT 3
  `);

  const cutoff7 = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const cutoff30 = start30.toISOString();

  for (const f of founders) {
    const u = byHandle.get(f.handle.toLowerCase());
    if (!u) continue;

    const windows = { "7d": cutoff7, "30d": cutoff30 };
    const agg: Record<string, Record<string, { n: number; inter: number; imp: number }>> = {};
    for (const [label, cutoff] of Object.entries(windows)) {
      agg[label] = {};
      for (const row of aggregate.all(f.handle, cutoff) as {
        kind: string;
        n: number;
        inter: number;
        imp: number;
      }[]) {
        agg[label][row.kind] = { n: row.n, inter: row.inter ?? 0, imp: row.imp ?? 0 };
      }
    }
    const sum = (label: string, field: "inter" | "imp") =>
      Object.values(agg[label]).reduce((s, v) => s + v[field], 0);

    insertSnapshot.run(
      f.handle,
      now,
      u.public_metrics?.followers_count ?? null,
      u.public_metrics?.tweet_count ?? null,
      agg["7d"].original?.n ?? 0,
      agg["7d"].reply?.n ?? 0,
      agg["7d"].retweet?.n ?? 0,
      agg["30d"].original?.n ?? 0,
      agg["30d"].reply?.n ?? 0,
      agg["30d"].retweet?.n ?? 0,
      sum("7d", "inter"),
      sum("30d", "inter"),
      sum("7d", "imp"),
      sum("30d", "imp")
    );

    deleteTopTweets.run(f.handle);
    rebuildTopTweets.run(f.handle, cutoff7);
  }

  // Prune posts that have aged out of every window.
  const pruned = db
    .prepare("DELETE FROM tweets WHERE created_at < ?")
    .run(new Date(Date.now() - 31 * DAY_MS).toISOString());

  console.log(
    `Done. ${fetched} new posts fetched, ${pruned.changes} old pruned.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
