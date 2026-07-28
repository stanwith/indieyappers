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
  // Only a 404 means "no such challenge". Everything else — 5xx, a rate
  // limit, a network error — has to throw: the page turns null into
  // notFound(), and at 60s ISR that would cache a false 404 over a live
  // challenge for the whole window. Better to surface the error and retry.
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Stanley challenge fetch failed for "${slug}": ${res.status}`
    );
  }
  const body = (await res.json()) as ApiResponse;
  // A row with no handle cannot be labelled or linked (profileUrl would emit
  // a bare threads.net/@), so drop it before ranking rather than let a blank
  // but selectable row occupy a rank number. Stanley's leaderboard treats
  // handle as nullable because it reads whichever platform_accounts row won
  // its identity tiebreak, and that row may not carry one.
  const ranked = body.rows.filter(
    (r): r is ApiRow & { handle: string } => Boolean(r.handle)
  );
  const entries = ranked.map(toEntry);

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

function toEntry(r: ApiRow & { handle: string }, i: number): Entry {
  return {
    // Stanley returns the rows already ranked by total views.
    rank: i + 1,
    handle: r.handle,
    name: r.displayName ?? r.handle,
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
