import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Arcade } from "@/components/arcade/Arcade";
import { getThreadsBoard } from "@/lib/threads-arcade-data";

/**
 * One Stanley Threads build-in-public challenge, in the arcade room.
 *
 * Operators do not deploy anything to add a board: setting a challenge window
 * on an event in Stanley's /hq/events makes its slug resolve here, and
 * archiving the event 404s it again.
 */

// Matches the 60s Cache-Control on Stanley's endpoint. The underlying views
// only move on a ~12h metrics poll, so per-request rendering would buy
// nothing but load.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const board = await getThreadsBoard(slug);
  if (!board) return { title: "Challenge not found" };
  const title = `${board.challenge.name} — live leaderboard`;
  const description =
    "Total Threads views on build-in-public posts during the challenge. Tracked by Stanley.";
  // No explicit openGraph block: Next fills og:title/og:description from
  // title/description, and declaring openGraph here would replace the object
  // inherited from the root segment — dropping app/opengraph-image.png.
  return { title, description };
}

export default async function ThreadsChallengePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const board = await getThreadsBoard(slug);
  if (!board) notFound();

  // auth is null: these boards have no sign-in, so there is no post-auth toast.
  return <Arcade data={board.data} auth={null} />;
}
