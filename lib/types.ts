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
  banner_url: string | null;
  tweets_fetched_at: string | null;
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
  /** One-line human description from data/blurbs.json, if we have one. */
  blurb: string | null;
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
  /**
   * The last refresh could not poll this account, so its numbers are stale and
   * its zeros are not evidence. Stale entries are unranked (rank 0), sorted
   * below the board, and rendered as "—" instead of real figures.
   */
  stale: boolean;
}

export interface TopTweet {
  tweetId: string;
  text: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
}

export interface CompanyDetail {
  slug: string;
  name: string;
  domain: string | null;
  logo: string | null;
  description: string | null;
  /** X profile banner of the top member, if they have one. */
  bannerUrl: string | null;
  members: LeaderboardEntry[];
  /** Top posts of the week per member handle. */
  topTweets: Record<string, TopTweet[]>;
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
