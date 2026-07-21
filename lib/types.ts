export interface SeedFounder {
  handle: string;
  name: string;
  product: string;
  tier: number;
  tierLabel: string;
  approxFollowers: number | null;
  notes: string;
  flag: string | null;
}

export interface FounderRow {
  handle: string;
  name: string;
  product: string;
  tier: number;
  tier_label: string;
  approx_followers: number | null;
  notes: string;
  x_user_id: string | null;
  avatar_url: string | null;
  followers: number | null;
  lifetime_tweet_count: number | null;
  profile_updated_at: string | null;
  company_domain: string | null;
  company_logo: string | null;
  company_desc: string | null;
}

export interface SnapshotRow {
  id: number;
  handle: string;
  captured_at: string;
  followers: number | null;
  lifetime_tweet_count: number | null;
  posts_7d_original: number;
  posts_7d_reply: number;
  posts_7d_retweet: number;
  posts_30d_original: number;
  posts_30d_reply: number;
  posts_30d_retweet: number;
  interactions_7d: number;
  interactions_30d: number;
  impressions_7d: number;
  impressions_30d: number;
}

export type TimeWindow = "7d" | "30d";

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  name: string;
  product: string;
  tier: number;
  tierLabel: string;
  avatarUrl: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companyLogo: string | null;
  companySlug: string;
  followers: number | null;
  postsOriginal: number;
  postsReply: number;
  postsRetweet: number;
  postsTotal: number;
  yapScore: number;
  interactions: number;
  impressions: number;
  /** Change in window post volume vs the previous snapshot (null until two snapshots exist). */
  delta: number | null;
  /** Rank movement vs the previous snapshot: positive = climbed (null until two snapshots exist). */
  rankDelta: number | null;
  capturedAt: string | null;
}

export interface CompanyEntry {
  rank: number;
  slug: string;
  name: string;
  domain: string | null;
  logo: string | null;
  yapperCount: number;
  topYapperHandle: string;
  topYapperName: string;
  topYapperAvatar: string | null;
  postsTotal: number;
  yapScore: number;
  interactions: number;
  impressions: number;
  delta: number | null;
  /** Rank movement vs the previous snapshot: positive = climbed. */
  rankDelta: number | null;
}

export interface RankHistory {
  /** ISO dates of each snapshot, oldest first. */
  dates: string[];
  series: {
    handle: string;
    /** Rank within the company at each date; null when no snapshot. */
    ranks: (number | null)[];
  }[];
}

export interface CompanyDetail {
  slug: string;
  name: string;
  domain: string | null;
  logo: string | null;
  description: string | null;
  members: LeaderboardEntry[];
  history: RankHistory;
}

export interface LeaderboardStats {
  totalPosts: number;
  mostActiveTier: { tier: number; label: string; posts: number } | null;
  biggestRiser: { handle: string; name: string; delta: number } | null;
  lastRefreshed: string | null;
}

/** Originals count full, replies half, retweets a quarter. */
export function yapScore(original: number, reply: number, retweet: number): number {
  return Math.round((original * 1.0 + reply * 0.5 + retweet * 0.25) * 10) / 10;
}
