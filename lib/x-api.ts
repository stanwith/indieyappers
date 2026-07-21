const API_BASE = "https://api.x.com/2";

export interface XUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}

export interface XTweet {
  id: string;
  created_at: string;
  referenced_tweets?: { type: "retweeted" | "replied_to" | "quoted"; id: string }[];
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count?: number;
    impression_count?: number;
  };
}

function bearerToken(): string {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      "X_BEARER_TOKEN is not set. Add it to .env.local (read-only app token from the X developer console)."
    );
  }
  return token;
}

async function xFetch(url: string): Promise<Response> {
  for (;;) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken()}` },
    });
    if (res.status !== 429) return res;

    const reset = Number(res.headers.get("x-rate-limit-reset"));
    const waitMs = Number.isFinite(reset)
      ? Math.max(reset * 1000 - Date.now(), 5_000)
      : 60_000;
    console.log(`  rate limited, waiting ${Math.ceil(waitMs / 1000)}s...`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

/** Resolve up to 100 handles per request. */
export async function getUsersByHandles(handles: string[]): Promise<XUser[]> {
  const users: XUser[] = [];
  for (let i = 0; i < handles.length; i += 100) {
    const batch = handles.slice(i, i + 100);
    const url =
      `${API_BASE}/users/by?usernames=${batch.join(",")}` +
      `&user.fields=profile_image_url,public_metrics`;
    const res = await xFetch(url);
    if (!res.ok) {
      throw new Error(`users/by failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data?: XUser[]; errors?: unknown[] };
    if (body.errors?.length) {
      console.warn(`  ${body.errors.length} handles could not be resolved`);
    }
    users.push(...(body.data ?? []));
  }
  return users;
}

/** Fetch all tweets for a user since startTime (paginated). */
export async function getUserTweetsSince(
  userId: string,
  startTime: Date
): Promise<XTweet[]> {
  const tweets: XTweet[] = [];
  let paginationToken: string | undefined;

  do {
    const params = new URLSearchParams({
      max_results: "100",
      start_time: startTime.toISOString(),
      "tweet.fields": "created_at,referenced_tweets,public_metrics",
    });
    if (paginationToken) params.set("pagination_token", paginationToken);

    const res = await xFetch(`${API_BASE}/users/${userId}/tweets?${params}`);
    if (!res.ok) {
      throw new Error(
        `users/${userId}/tweets failed: ${res.status} ${await res.text()}`
      );
    }
    const body = (await res.json()) as {
      data?: XTweet[];
      meta?: { next_token?: string };
    };
    tweets.push(...(body.data ?? []));
    paginationToken = body.meta?.next_token;
  } while (paginationToken);

  return tweets;
}

export function classifyTweet(t: XTweet): "original" | "reply" | "retweet" {
  const refs = t.referenced_tweets ?? [];
  if (refs.some((r) => r.type === "retweeted")) return "retweet";
  if (refs.some((r) => r.type === "replied_to")) return "reply";
  return "original"; // quotes count as originals
}

/** Likes + replies + retweets + quotes received by a tweet. */
export function tweetInteractions(t: XTweet): number {
  const m = t.public_metrics;
  if (!m) return 0;
  return m.like_count + m.reply_count + m.retweet_count + m.quote_count;
}

export function tweetImpressions(t: XTweet): number {
  return t.public_metrics?.impression_count ?? 0;
}
