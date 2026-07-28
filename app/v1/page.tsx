import Image from "next/image";
import { getLeaderboardWithSignups, getStats } from "@/lib/leaderboard";
import { getSessionUser } from "@/lib/auth";
import type { TimeWindow } from "@/lib/types";
import { AuthBanner } from "@/components/AuthBanner";
import { TopNav } from "@/components/TopNav";
import { YapperBoard } from "@/components/YapperBoard";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; auth?: string }>;
}) {
  const params = await searchParams;
  const window: TimeWindow = params.window === "30d" ? "30d" : "7d";
  const entries = await getLeaderboardWithSignups(window);
  const stats = getStats(window);

  const sessionUser = await getSessionUser();
  const myEntry = sessionUser
    ? entries.find(
        (e) => e.handle.toLowerCase() === sessionUser.handle.toLowerCase()
      )
    : null;
  const authStatus =
    params.auth === "ok" && sessionUser
      ? ("ok" as const)
      : params.auth === "failed"
        ? ("failed" as const)
        : null;

  return (
    <>
      <TopNav />
      <main className="yapper-hero-glow mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-12 sm:px-8">
        <header className="mb-10 flex flex-col items-center text-center">
          <Image
            src="/stanley-mascot-3.png"
            alt="Stanley"
            width={82}
            height={85}
            className="h-[85px] w-[82px] select-none object-contain"
            priority
          />
          <h1 className="mt-6 font-display text-4xl leading-tight text-text sm:text-5xl">
            Who&apos;s building the{" "}
            <em className="text-[var(--iris-700)]">loudest</em>?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-text-secondary">
            {entries.length} indie founders, ranked by how much they post on X.
            Tracked by Stanley.
          </p>
        </header>

        {authStatus && (
          <AuthBanner
            status={authStatus}
            handle={sessionUser?.handle}
            rank={myEntry?.rank ?? null}
            total={entries.length}
          />
        )}

        <YapperBoard
          entries={entries}
          window={window}
          sessionHandle={sessionUser?.handle ?? null}
          updatedLabel={
            stats.lastRefreshed
              ? `updated ${formatRelative(stats.lastRefreshed)}`
              : null
          }
        />

      </main>
    </>
  );
}
