/**
 * Immediate placement for sign-ups: fetch a newly authorized account's last
 * 30 days of posts and compute the same window aggregates the seed founders
 * get, so they rank accurately the moment they land on the board.
 */
import {
  getUserTweetsSince,
  classifyTweet,
  tweetInteractions,
  tweetImpressions,
} from "./x-api";
import type { JoinedMetrics } from "./pgstore";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function computeJoinedMetrics(
  xUserId: string
): Promise<JoinedMetrics> {
  const start30 = new Date(Date.now() - 30 * DAY_MS);
  const cutoff7 = Date.now() - 7 * DAY_MS;
  const tweets = await getUserTweetsSince(xUserId, { startTime: start30 });

  const metrics: JoinedMetrics = {
    posts_7d_original: 0,
    posts_7d_reply: 0,
    posts_7d_retweet: 0,
    posts_30d_original: 0,
    posts_30d_reply: 0,
    posts_30d_retweet: 0,
    interactions_7d: 0,
    interactions_30d: 0,
    impressions_7d: 0,
    impressions_30d: 0,
  };

  for (const t of tweets) {
    const kind = classifyTweet(t); // "original" | "reply" | "retweet"
    const inter = tweetInteractions(t);
    const imp = tweetImpressions(t);
    metrics[`posts_30d_${kind}`]++;
    metrics.interactions_30d += inter;
    metrics.impressions_30d += imp;
    if (new Date(t.created_at).getTime() >= cutoff7) {
      metrics[`posts_7d_${kind}`]++;
      metrics.interactions_7d += inter;
      metrics.impressions_7d += imp;
    }
  }

  return metrics;
}
