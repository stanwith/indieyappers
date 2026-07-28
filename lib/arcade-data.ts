import fs from "node:fs";
import path from "node:path";
import { getLeaderboardWithSignups } from "./leaderboard";
import type { LeaderboardEntry } from "./types";
import type {
  ArcadeData,
  Entry,
} from "@/components/arcade/data/leaderboard";

/**
 * The arcade ships ~100 avatar jpgs copied from the seed data. Prefer those
 * (same-origin, guaranteed no canvas taint) and fall back to the live
 * pbs.twimg.com URL for sign-ups we have no local file for.
 */
const localAvatars = new Map(
  fs
    .readdirSync(path.join(process.cwd(), "public", "avatars"))
    .map((f) => [f.replace(/\.jpg$/, "").toLowerCase(), `/avatars/${f}`])
);

function toEntry(e: LeaderboardEntry): Entry {
  return {
    rank: e.rank,
    handle: e.handle,
    name: e.name,
    product: e.product,
    companyName: e.companyName ?? "",
    blurb: e.blurb,
    followers: e.followers ?? 0,
    postsTotal: e.postsTotal,
    yapScore: e.yapScore,
    interactions: e.interactions,
    impressions: e.impressions,
    rankDelta: e.rankDelta ?? 0,
    avatar: localAvatars.get(e.handle.toLowerCase()) ?? e.avatarUrl,
    stale: e.stale,
  };
}

export async function getArcadeData(): Promise<Omit<ArcadeData, "user">> {
  const [d7, d30] = await Promise.all([
    getLeaderboardWithSignups("7d"),
    getLeaderboardWithSignups("30d"),
  ]);
  return {
    // how getStats derives lastRefreshed — without re-running the pipeline
    capturedAt: d7.find((e) => e.capturedAt)?.capturedAt ?? "",
    windows: { "7d": d7.map(toEntry), "30d": d30.map(toEntry) },
  };
}
