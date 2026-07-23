import { getDb } from "./db";
import {
  pgConfigured,
  pgGetJoinedFounder,
  pgListJoinedFounders,
} from "./pgstore";
import { companySlug } from "./slug";
import {
  yapScore,
  type CompanyDetail,
  type FounderRow,
  type SnapshotRow,
  type LeaderboardEntry,
  type LeaderboardStats,
  type TimeWindow,
  type TopTweet,
} from "./types";

type JoinedRow = FounderRow & Partial<SnapshotRow> & { captured_at?: string };

/** First product name in the seed's "Product / known for" field. */
function primaryProduct(product: string): string {
  const name = product
    .replace(/\(.*?\)/g, "") // drop parentheticals before splitting
    .split(/[,;+]/)[0]
    .replace(/^\s*(sold|acquired|ex-)\s+/i, "") // "Sold Talknotes" -> "Talknotes"
    .replace(/\b(exit|sold|acquired)\b.*$/i, "")
    .trim();
  return name || product.replace(/\(.*?\)/g, "").split(/[,;+]/)[0].trim();
}

function latestSnapshotsJoin(): JoinedRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT f.*, s.captured_at,
              s.posts_7d_original, s.posts_7d_reply, s.posts_7d_retweet,
              s.posts_30d_original, s.posts_30d_reply, s.posts_30d_retweet,
              s.interactions_7d, s.interactions_30d,
              s.impressions_7d, s.impressions_30d
       FROM founders f
       LEFT JOIN activity_snapshots s ON s.id = (
         SELECT id FROM activity_snapshots
         WHERE handle = f.handle
         ORDER BY captured_at DESC, id DESC
         LIMIT 1
       )`
    )
    .all() as JoinedRow[];
}

export function getLeaderboard(window: TimeWindow): LeaderboardEntry[] {
  const rows = latestSnapshotsJoin();
  const deltas = getDeltas(window);
  const prevRanks = getPreviousRanks(window);

  const entries = rows.map((r) => {
    const original =
      (window === "7d" ? r.posts_7d_original : r.posts_30d_original) ?? 0;
    const reply = (window === "7d" ? r.posts_7d_reply : r.posts_30d_reply) ?? 0;
    const retweet =
      (window === "7d" ? r.posts_7d_retweet : r.posts_30d_retweet) ?? 0;
    return {
      rank: 0,
      handle: r.handle,
      name: r.name,
      product: r.product,
      tier: r.tier,
      tierLabel: r.tier_label,
      avatarUrl: r.avatar_url ?? `https://unavatar.io/twitter/${r.handle}`,
      companyName: primaryProduct(r.product) || null,
      companyDomain: r.company_domain ?? null,
      companyLogo: r.company_logo ?? null,
      companySlug: companySlug(
        r.company_domain,
        primaryProduct(r.product) || r.handle
      ),
      followers: r.followers ?? r.approx_followers,
      postsOriginal: original,
      postsReply: reply,
      postsRetweet: retweet,
      postsTotal: original + reply + retweet,
      yapScore: yapScore(original, reply, retweet),
      interactions:
        (window === "7d" ? r.interactions_7d : r.interactions_30d) ?? 0,
      impressions:
        (window === "7d" ? r.impressions_7d : r.impressions_30d) ?? 0,
      delta: deltas.get(r.handle) ?? null,
      rankDelta: null as number | null,
      capturedAt: r.captured_at ?? null,
    };
  });

  // Rank by impressions like the reference; yap score breaks ties (and
  // carries the ordering entirely until impressions data exists).
  entries.sort(
    (a, b) =>
      b.impressions - a.impressions ||
      b.yapScore - a.yapScore ||
      b.postsTotal - a.postsTotal
  );
  entries.forEach((e, i) => {
    e.rank = i + 1;
    const prev = prevRanks.get(e.handle);
    e.rankDelta = prev === undefined ? null : prev - e.rank;
  });
  return entries;
}

/**
 * Ranks as of the previous snapshot (same ordering rules as the live board).
 * Empty until at least two refreshes have run.
 */
function getPreviousRanks(window: TimeWindow): Map<string, number> {
  const db = getDb();
  const suffix = window === "7d" ? "7d" : "30d";
  const rows = db
    .prepare(
      `SELECT s.handle,
              s.impressions_${suffix} AS impressions,
              s.posts_${suffix}_original AS o,
              s.posts_${suffix}_reply AS r,
              s.posts_${suffix}_retweet AS t
       FROM activity_snapshots s
       WHERE s.id = (
         SELECT id FROM activity_snapshots
         WHERE handle = s.handle
         ORDER BY captured_at DESC, id DESC
         LIMIT 1 OFFSET 1
       )`
    )
    .all() as { handle: string; impressions: number; o: number; r: number; t: number }[];

  rows.sort(
    (a, b) =>
      b.impressions - a.impressions ||
      yapScore(b.o, b.r, b.t) - yapScore(a.o, a.r, a.t)
  );
  return new Map(rows.map((row, i) => [row.handle, i + 1]));
}

/**
 * Leaderboard plus sign-ups from the shared Postgres store (production).
 * Signed-up accounts appear at the bottom with zero activity until the
 * refresh pipeline starts tracking them.
 */
export async function getLeaderboardWithSignups(
  window: TimeWindow
): Promise<LeaderboardEntry[]> {
  const entries = getLeaderboard(window);
  if (!pgConfigured()) return entries;

  let joined;
  try {
    joined = await pgListJoinedFounders();
  } catch (err) {
    console.error("failed to load sign-ups from Postgres:", err);
    return entries;
  }

  const seen = new Set(entries.map((e) => e.handle.toLowerCase()));
  for (const j of joined) {
    if (seen.has(j.handle.toLowerCase())) continue;
    const original =
      window === "7d" ? j.posts_7d_original : j.posts_30d_original;
    const reply = window === "7d" ? j.posts_7d_reply : j.posts_30d_reply;
    const retweet = window === "7d" ? j.posts_7d_retweet : j.posts_30d_retweet;
    entries.push({
      rank: 0,
      handle: j.handle,
      name: j.name,
      product: "",
      tier: 4,
      tierLabel: "4 - Rising (<10K)",
      avatarUrl: j.avatar_url ?? `https://unavatar.io/twitter/${j.handle}`,
      companyName: null,
      companyDomain: null,
      companyLogo: null,
      companySlug: companySlug(null, j.handle),
      followers: j.followers,
      postsOriginal: original,
      postsReply: reply,
      postsRetweet: retweet,
      postsTotal: original + reply + retweet,
      yapScore: yapScore(original, reply, retweet),
      interactions:
        window === "7d" ? j.interactions_7d : j.interactions_30d,
      impressions: window === "7d" ? j.impressions_7d : j.impressions_30d,
      delta: null,
      rankDelta: null,
      capturedAt: j.metrics_updated_at,
    });
  }

  // Re-rank the combined board so sign-ups with real numbers slot in
  // where they belong instead of pooling at the bottom.
  entries.sort(
    (a, b) =>
      b.impressions - a.impressions ||
      b.yapScore - a.yapScore ||
      b.postsTotal - a.postsTotal
  );
  entries.forEach((e, i) => (e.rank = i + 1));
  return entries;
}

/**
 * Everything the profile page needs: company (or person) info, ranked
 * members, and top posts. Falls back to the shared Postgres store for
 * sign-ups that the nightly pipeline hasn't adopted yet.
 */
export async function getCompanyDetail(
  slug: string,
  window: TimeWindow
): Promise<CompanyDetail | null> {
  const members = (await getLeaderboardWithSignups(window))
    .filter((e) => e.companySlug === slug)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  if (members.length === 0) return null;

  const db = getDb();
  const top = members[0];
  const founder = db
    .prepare("SELECT * FROM founders WHERE handle = ?")
    .get(top.handle) as FounderRow | undefined;

  // Pre-adoption sign-up: profile data lives in Postgres.
  if (!founder) {
    const joined = await pgGetJoinedFounder(top.handle);
    return {
      slug,
      name: top.name,
      domain: null,
      logo: null,
      description: `${top.name} joined the leaderboard with Sign in with X.`,
      bannerUrl: joined?.banner_url ?? null,
      members,
      topTweets: joined?.top_tweets_json
        ? { [top.handle]: JSON.parse(joined.top_tweets_json) }
        : {},
    };
  }

  const isPersonPage = !top.companyName;
  return {
    slug,
    name: top.companyName ?? top.name,
    domain: top.companyDomain,
    logo: top.companyLogo,
    description: isPersonPage
      ? `${top.name} joined the leaderboard with Sign in with X.`
      : (founder.company_desc ??
        `${top.companyName} is what @${top.handle} ships when they're not posting. ${founder.notes}`),
    bannerUrl: founder.banner_url,
    members,
    topTweets: getTopTweets(members.map((m) => m.handle)),
  };
}

/** Stored top posts of the week, keyed by handle, best first. */
function getTopTweets(handles: string[]): Record<string, TopTweet[]> {
  const db = getDb();
  const placeholders = handles.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT handle, tweet_id, text, created_at, likes, retweets, replies, impressions
       FROM top_tweets WHERE handle IN (${placeholders})
       ORDER BY (likes + retweets + replies) DESC`
    )
    .all(...handles) as {
    handle: string;
    tweet_id: string;
    text: string;
    created_at: string;
    likes: number;
    retweets: number;
    replies: number;
    impressions: number;
  }[];

  const byHandle: Record<string, TopTweet[]> = {};
  for (const r of rows) {
    (byHandle[r.handle] ??= []).push({
      tweetId: r.tweet_id,
      text: r.text,
      createdAt: r.created_at,
      likes: r.likes,
      retweets: r.retweets,
      replies: r.replies,
      impressions: r.impressions,
    });
  }
  return byHandle;
}

export function getStats(window: TimeWindow): LeaderboardStats {
  const entries = getLeaderboard(window);
  const totalPosts = entries.reduce((sum, e) => sum + e.postsTotal, 0);

  const tierTotals = new Map<number, { label: string; posts: number }>();
  for (const e of entries) {
    const cur = tierTotals.get(e.tier) ?? { label: e.tierLabel, posts: 0 };
    cur.posts += e.postsTotal;
    tierTotals.set(e.tier, cur);
  }
  let mostActiveTier: LeaderboardStats["mostActiveTier"] = null;
  for (const [tier, { label, posts }] of tierTotals) {
    if (!mostActiveTier || posts > mostActiveTier.posts) {
      mostActiveTier = { tier, label, posts };
    }
  }

  return {
    totalPosts,
    mostActiveTier,
    biggestRiser: getBiggestRiser(window),
    lastRefreshed: entries.find((e) => e.capturedAt)?.capturedAt ?? null,
  };
}

/**
 * Per-founder change in window post volume between the two most recent
 * snapshots. Empty until at least two refreshes have run.
 */
function getDeltas(window: TimeWindow): Map<string, number> {
  const db = getDb();
  const col = window === "7d" ? "posts_7d" : "posts_30d";
  const rows = db
    .prepare(
      `SELECT f.handle,
              (s1.${col}_original + s1.${col}_reply + s1.${col}_retweet) -
              (s2.${col}_original + s2.${col}_reply + s2.${col}_retweet) AS delta
       FROM founders f
       JOIN activity_snapshots s1 ON s1.id = (
         SELECT id FROM activity_snapshots WHERE handle = f.handle
         ORDER BY captured_at DESC, id DESC LIMIT 1
       )
       JOIN activity_snapshots s2 ON s2.id = (
         SELECT id FROM activity_snapshots WHERE handle = f.handle
         ORDER BY captured_at DESC, id DESC LIMIT 1 OFFSET 1
       )`
    )
    .all() as { handle: string; delta: number }[];
  return new Map(rows.map((r) => [r.handle, r.delta]));
}

function getBiggestRiser(window: TimeWindow): LeaderboardStats["biggestRiser"] {
  const db = getDb();
  const deltas = getDeltas(window);
  let best: { handle: string; delta: number } | null = null;
  for (const [handle, delta] of deltas) {
    if (!best || delta > best.delta) best = { handle, delta };
  }
  if (!best || best.delta <= 0) return null;
  const row = db
    .prepare("SELECT name FROM founders WHERE handle = ?")
    .get(best.handle) as { name: string };
  return { handle: best.handle, name: row.name, delta: best.delta };
}
