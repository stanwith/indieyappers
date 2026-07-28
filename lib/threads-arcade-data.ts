import type {
  ArcadeData,
  Entry,
} from "@/components/arcade/data/leaderboard";

/**
 * Threads challenge boards. Where the X board reads this repo's own Postgres
 * seeded from data/founders.json, a challenge board reads Stanley: standings
 * are computed there (total Threads views on qualified in-window posts) and
 * served as JSON. Nothing about the X path is involved — no founders seed, no
 * pgstore, no X OAuth.
 */
export const STANLEY_BASE_URL =
  process.env.STANLEY_BASE_URL ?? "https://x.getstanley.ai";

interface ApiRow {
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  postCount: number;
  totalViews: number;
}

interface ApiResponse {
  challenge: { slug: string; name: string; startsAt: string; endsAt: string };
  rows: ApiRow[];
}

export interface ThreadsBoard {
  data: ArcadeData;
  challenge: ApiResponse["challenge"];
}

/** null means Stanley does not know this slug, or the challenge is archived. */
export async function getThreadsBoard(
  slug: string
): Promise<ThreadsBoard | null> {
  const res = await fetch(
    `${STANLEY_BASE_URL}/api/public/challenges/${encodeURIComponent(slug)}`
  );
  if (!res.ok) return null;
  const body = (await res.json()) as ApiResponse;
  const entries = body.rows.map(toEntry);

  return {
    challenge: body.challenge,
    data: {
      // Stanley's leaderboard carries no snapshot timestamp, so the freshness
      // line stays empty. Worth knowing: views refresh on a ~12h poll there,
      // so these numbers are not live even though the arcade feels like it.
      capturedAt: "",
      // A challenge is one fixed window, so there is nothing for the 7D/30D
      // tabs to toggle between — both slots hold the same rows and ←→ becomes
      // a no-op. Deliberate: hiding the tabs would mean a second layout for
      // the CRT header.
      windows: { "7d": entries, "30d": entries },
      // No sign-in on these boards. This one null switches off the pinned "my
      // rank" row, the attract screen's "you're on the board" line and the
      // post-auth toast, so "SEE MY RANK" always points at Stanley.
      user: null,
      platform: "threads",
      seeMyRankUrl: `${STANLEY_BASE_URL}/e/${body.challenge.slug}`,
      boardTitle: body.challenge.name,
    },
  };
}

function toEntry(r: ApiRow, i: number): Entry {
  const handle = r.handle ?? "";
  return {
    // Stanley returns the rows already ranked by total views.
    rank: i + 1,
    handle,
    name: r.displayName ?? handle,
    avatar: r.avatarUrl,
    postsTotal: r.postCount,
    impressions: r.totalViews,
    // Figures the challenge query has no source for. Zeros rather than
    // optional fields: Entry keeps one shape, the threads render branch never
    // reads these, and nothing downstream has to handle undefined.
    product: "",
    companyName: "",
    blurb: null,
    followers: 0,
    yapScore: 0,
    interactions: 0,
    rankDelta: 0,
    // Only meaningful for the X board, where it means "we could not poll this
    // account". A missing challenge participant simply is not in the payload.
    stale: false,
  };
}
