import { getDb } from "./db";
import { companySlug } from "./slug";
import {
  yapScore,
  type CompanyDetail,
  type CompanyEntry,
  type FounderRow,
  type SnapshotRow,
  type LeaderboardEntry,
  type LeaderboardStats,
  type RankHistory,
  type TimeWindow,
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
      companyName: primaryProduct(r.product),
      companyDomain: r.company_domain ?? null,
      companyLogo: r.company_logo ?? null,
      companySlug: companySlug(r.company_domain, primaryProduct(r.product)),
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

/** Group founders by company and rank companies by combined yap score. */
export function getCompanies(window: TimeWindow): CompanyEntry[] {
  const entries = getLeaderboard(window);
  const rows = latestSnapshotsJoin();
  const byHandle = new Map(rows.map((r) => [r.handle, r]));

  const groups = new Map<string, CompanyEntry & { _seen: boolean }>();
  for (const e of entries) {
    const key = e.companySlug;
    const founder = byHandle.get(e.handle);
    let g = groups.get(key);
    if (!g) {
      g = {
        rank: 0,
        slug: e.companySlug,
        name: e.companyName ?? e.name,
        domain: e.companyDomain,
        logo: e.companyLogo ?? founder?.company_logo ?? null,
        yapperCount: 0,
        topYapperHandle: e.handle,
        topYapperName: e.name,
        topYapperAvatar: e.avatarUrl,
        postsTotal: 0,
        yapScore: 0,
        interactions: 0,
        impressions: 0,
        delta: null,
        rankDelta: null,
        _seen: false,
      };
      groups.set(key, g);
    }
    g.yapperCount++;
    g.postsTotal += e.postsTotal;
    g.yapScore = Math.round((g.yapScore + e.yapScore) * 10) / 10;
    g.interactions += e.interactions;
    g.impressions += e.impressions;
    if (e.delta !== null) g.delta = (g.delta ?? 0) + e.delta;
    // entries are already sorted by yap score, so the first founder seen is the top yapper
    if (!g._seen) {
      g.topYapperHandle = e.handle;
      g.topYapperName = e.name;
      g.topYapperAvatar = e.avatarUrl;
      g._seen = true;
    }
  }

  const companies = [...groups.values()].map(({ _seen, ...rest }) => rest);
  companies.sort(
    (a, b) =>
      b.impressions - a.impressions ||
      b.yapScore - a.yapScore ||
      b.postsTotal - a.postsTotal
  );

  // Company rank movement: rebuild the previous board from the previous
  // snapshot's impressions and compare positions.
  const prevByHandle = getPreviousImpressions(window);
  const slugByHandle = new Map(entries.map((e) => [e.handle, e.companySlug]));
  const prevCompanyImpressions = new Map<string, number>();
  for (const [handle, impressions] of prevByHandle) {
    const slug = slugByHandle.get(handle);
    if (!slug) continue;
    prevCompanyImpressions.set(
      slug,
      (prevCompanyImpressions.get(slug) ?? 0) + impressions
    );
  }
  const prevOrder = [...prevCompanyImpressions.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  const prevRank = new Map(prevOrder.map(([slug], i) => [slug, i + 1]));

  companies.forEach((c, i) => {
    c.rank = i + 1;
    const prev = prevRank.get(c.slug);
    c.rankDelta = prev === undefined ? null : prev - c.rank;
  });
  return companies;
}

/** Impressions per founder as of the previous snapshot. */
function getPreviousImpressions(window: TimeWindow): Map<string, number> {
  const db = getDb();
  const col = window === "7d" ? "impressions_7d" : "impressions_30d";
  const rows = db
    .prepare(
      `SELECT s.handle, s.${col} AS impressions
       FROM activity_snapshots s
       WHERE s.id = (
         SELECT id FROM activity_snapshots
         WHERE handle = s.handle
         ORDER BY captured_at DESC, id DESC
         LIMIT 1 OFFSET 1
       )`
    )
    .all() as { handle: string; impressions: number }[];
  return new Map(rows.map((r) => [r.handle, r.impressions]));
}

/** Everything the company page needs: profile, ranked members, rank history. */
export function getCompanyDetail(
  slug: string,
  window: TimeWindow
): CompanyDetail | null {
  const members = getLeaderboard(window)
    .filter((e) => e.companySlug === slug)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  if (members.length === 0) return null;

  const db = getDb();
  const top = members[0];
  const founder = db
    .prepare("SELECT * FROM founders WHERE handle = ?")
    .get(top.handle) as FounderRow;

  return {
    slug,
    name: top.companyName ?? top.name,
    domain: top.companyDomain,
    logo: top.companyLogo,
    description:
      founder.company_desc ??
      `${top.companyName ?? top.name} is what @${top.handle} ships when they're not posting. ${founder.notes}`,
    members,
    history: getRankHistory(members.map((m) => m.handle), window),
  };
}

/**
 * Rank of each member within the company at every snapshot timestamp,
 * oldest first. Used by the rank history chart.
 */
function getRankHistory(handles: string[], window: TimeWindow): RankHistory {
  const db = getDb();
  const col = window === "7d" ? "posts_7d" : "posts_30d";
  const placeholders = handles.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT handle, captured_at,
              ${col}_original AS o, ${col}_reply AS r, ${col}_retweet AS t
       FROM activity_snapshots
       WHERE handle IN (${placeholders})
       ORDER BY captured_at ASC`
    )
    .all(...handles) as {
    handle: string;
    captured_at: string;
    o: number;
    r: number;
    t: number;
  }[];

  const dates = [...new Set(rows.map((r) => r.captured_at))];
  const scoreAt = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!scoreAt.has(row.captured_at)) scoreAt.set(row.captured_at, new Map());
    scoreAt.get(row.captured_at)!.set(row.handle, yapScore(row.o, row.r, row.t));
  }

  const series = handles.slice(0, 10).map((handle) => ({
    handle,
    ranks: dates.map((date) => {
      const scores = scoreAt.get(date)!;
      if (!scores.has(handle)) return null;
      const mine = scores.get(handle)!;
      let rank = 1;
      for (const [other, score] of scores) {
        if (other !== handle && score > mine) rank++;
      }
      return rank;
    }),
  }));

  return { dates, series };
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
