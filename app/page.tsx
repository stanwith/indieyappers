import Image from "next/image";
import { getCompanies, getLeaderboard, getStats } from "@/lib/leaderboard";
import type { TimeWindow } from "@/lib/types";
import { TopNav } from "@/components/TopNav";
import { YapperBoard } from "@/components/YapperBoard";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const window: TimeWindow = params.window === "30d" ? "30d" : "7d";
  const initialTab = params.tab === "companies" ? "companies" : "people";
  const entries = getLeaderboard(window);
  const companies = getCompanies(window);
  const stats = getStats(window);

  return (
    <>
      <TopNav />
      <main className="yapper-hero-glow mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-12 sm:px-8">
        <header className="mb-10 flex flex-col items-center text-center">
          <Image
            src="/stanley-wings.png"
            alt="Stanley"
            width={82}
            height={85}
            className="h-[85px] w-[82px] select-none object-contain"
            priority
          />
          <h1 className="mt-6 font-display text-4xl leading-tight text-text sm:text-5xl">
            Who&apos;s the biggest{" "}
            <em className="text-[var(--iris-700)]">yapper</em>?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-text-secondary">
            {entries.length} indie founders, ranked by how much they post on X.
            Tracked by Stanley.
          </p>
        </header>

        <YapperBoard
          entries={entries}
          companies={companies}
          window={window}
          initialTab={initialTab}
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
