import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyDetail } from "@/lib/leaderboard";
import type { TimeWindow, TopTweet } from "@/lib/types";
import { formatCompact, formatNumber, formatRelative } from "@/lib/format";
import { TopNav } from "@/components/TopNav";
import { Avatar } from "@/components/Avatar";
import { ExpandableText } from "@/components/ExpandableText";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getCompanyDetail(decodeURIComponent(slug), "7d");
  return {
    title: detail
      ? `${detail.name} — Indie Hot 100`
      : "Indie Hot 100",
  };
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const window: TimeWindow = sp.window === "30d" ? "30d" : "7d";
  const detail = await getCompanyDetail(decodeURIComponent(slug), window);
  if (!detail) notFound();

  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-16 pt-6 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Back to the board
        </Link>

        {/* Banner: the top member's X banner when available, Stanley panel otherwise */}
        <div className="relative mt-4 h-36 overflow-hidden rounded-[var(--radius-xl)] bg-gray-950 sm:h-44">
          {detail.bannerUrl ? (
            <Image
              src={detail.bannerUrl}
              alt=""
              aria-hidden
              fill
              className="object-cover"
              unoptimized
              priority
            />
          ) : (
            <>
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(560px 280px at 12% 130%, #8479ff59, transparent 70%), radial-gradient(620px 300px at 90% -30%, #5a4ee042, transparent 70%)",
                }}
              />
              <span
                aria-hidden
                className="absolute -bottom-3 right-6 select-none font-display text-6xl italic leading-none text-white/[0.07] sm:text-7xl"
              >
                {detail.name}
              </span>
            </>
          )}
        </div>

        {/* Company header — logo overlaps the banner like a profile page */}
        <div className="px-2 sm:px-6">
          <div className="relative z-10 -mt-11 flex items-end justify-between">
            <HeaderLogo name={detail.name} logo={detail.logo} />
            {detail.domain && (
              <a
                href={`https://${detail.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="stanley-control-button mb-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium"
              >
                Visit {detail.domain}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M7 7h10v10" />
                  <path d="M7 17 17 7" />
                </svg>
              </a>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-text">
              {detail.name}
            </h1>
            <p className="font-code text-[11px] text-text-tertiary truncate">
              @{detail.members[0].handle}
              {detail.domain ? ` · ${detail.domain}` : ""} ·{" "}
              {detail.members.length}{" "}
              {detail.members.length === 1 ? "yapper" : "yappers"} tracked
            </p>
            {detail.description && (
              <div className="mt-2 max-w-2xl">
                <ExpandableText text={detail.description} />
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-xl leading-tight text-text">
                Leaderboard
              </h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-text-secondary">
                All posts
              </span>
            </div>
            <div className="stanley-segmented-control">
              {(["7d", "30d"] as const).map((w) => (
                <Link
                  key={w}
                  href={`/company/${detail.slug}${w === "7d" ? "" : "?window=30d"}`}
                  className={`stanley-segmented-tab px-3 py-1 text-[12px] font-medium ${
                    window === w ? "is-active" : ""
                  }`}
                >
                  {w === "7d" ? "7 days" : "30 days"}
                </Link>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-gray-25">
                  <Th className="w-16 pl-5">Rank</Th>
                  <Th className="w-16">24h</Th>
                  <Th>Account</Th>
                  <Th className="hidden sm:table-cell text-right">
                    Followers
                  </Th>
                  <Th className="text-right">Yaps ({window})</Th>
                  <Th className="pr-5 text-right">Yap score ({window})</Th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((m) => (
                  <tr
                    key={m.handle}
                    className={`border-b border-border-subtle last:border-b-0 transition-colors duration-150 hover:bg-[var(--surface-hover-ink)] ${
                      m.rank === 1 ? "bg-gray-50" : ""
                    }`}
                  >
                    <td className="py-3 pl-5">
                      <span
                        className={`text-[13px] font-semibold tabular-nums ${
                          m.rank === 1
                            ? "text-[var(--iris-700)]"
                            : "text-text-tertiary"
                        }`}
                      >
                        {m.rank}
                      </span>
                    </td>
                    <td className="py-3">
                      <Delta value={m.delta} />
                    </td>
                    <td className="py-3">
                      <a
                        href={`https://x.com/${m.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-3 hover:opacity-80"
                      >
                        <span
                          className={
                            m.rank === 1
                              ? "rounded-full ring-2 ring-[var(--iris-500)] ring-offset-1"
                              : ""
                          }
                        >
                          <Avatar name={m.name} url={m.avatarUrl} size={34} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] font-medium leading-tight text-text">
                            {m.name}
                          </span>
                          <span className="truncate font-code text-[11px] text-text-tertiary">
                            @{m.handle}
                          </span>
                        </span>
                      </a>
                    </td>
                    <td className="hidden sm:table-cell py-3 text-right font-code text-[11px] text-text-secondary tabular-nums">
                      {formatCompact(m.followers)}
                    </td>
                    <td className="py-3 text-right text-[13px] font-semibold tabular-nums text-text">
                      {formatNumber(m.postsTotal)}
                    </td>
                    <td className="py-3 pr-5 text-right font-code text-[11px] tabular-nums text-text-secondary">
                      {formatNumber(m.yapScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top posts of the week */}
        <section className="mt-10">
          <div className="mb-4">
            <h2 className="font-display text-xl leading-tight text-text">
              Top posts this week
            </h2>
            <p className="mt-1 font-code text-[11px] text-text-tertiary">
              Each member&apos;s three biggest posts from the last 7 days
            </p>
          </div>

          <div className="flex flex-col gap-8">
            {detail.members.map((m) => {
              const tweets = detail.topTweets[m.handle] ?? [];
              return (
                <div key={m.handle}>
                  <div className="mb-3 flex items-center gap-2.5">
                    <Avatar name={m.name} url={m.avatarUrl} size={24} />
                    <span className="text-[13px] font-medium text-text">
                      {m.name}
                    </span>
                    <span className="font-code text-[11px] text-text-tertiary">
                      @{m.handle}
                    </span>
                  </div>
                  {tweets.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      {tweets.map((t) => (
                        <TweetCard key={t.tweetId} tweet={t} handle={m.handle} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 text-[13px] text-text-tertiary">
                      No original posts in the last 7 days.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

      </main>
    </>
  );
}

function TweetCard({ tweet, handle }: { tweet: TopTweet; handle: string }) {
  return (
    <a
      href={`https://x.com/${handle}/status/${tweet.tweetId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)] transition-all duration-150 hover:-translate-y-px hover:shadow-[var(--shadow-sm)]"
    >
      <p className="text-[13px] leading-relaxed text-text [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:5] overflow-hidden">
        {tweet.text}
      </p>
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <span className="font-code text-[10.5px] text-text-tertiary tabular-nums">
          {formatCompact(tweet.likes)} likes · {formatCompact(tweet.replies)}{" "}
          replies · {formatCompact(tweet.impressions)} views
        </span>
        <span className="shrink-0 font-code text-[10.5px] text-text-tertiary">
          {formatRelative(tweet.createdAt)}
        </span>
      </div>
    </a>
  );
}

/**
 * White badge on the banner edge. Width adapts to the logo: square for
 * icons, a wide pill for wordmark logos, so neither renders tiny.
 */
function HeaderLogo({ name, logo }: { name: string; logo: string | null }) {
  return (
    <span className="inline-flex h-[88px] min-w-[88px] max-w-[280px] shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-white px-4 py-4 shadow-[var(--shadow-md)]">
      {logo ? (
        <Image
          src={logo}
          alt={name}
          width={240}
          height={56}
          className="h-full w-auto max-w-full object-contain"
          unoptimized
        />
      ) : (
        <span className="font-display text-3xl text-text-secondary">
          {name[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </span>
  );
}

function CompanyLogo({
  name,
  logo,
  size,
}: {
  name: string;
  logo: string | null;
  size: number;
}) {
  if (logo) {
    return (
      <Image
        src={logo}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-border bg-white object-contain shadow-[var(--shadow-sm)]"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-border bg-[var(--surface-sunken)] font-display text-text-secondary shadow-[var(--shadow-sm)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null || value === 0) {
    return <span className="text-[13px] text-text-tertiary">—</span>;
  }
  const up = value > 0;
  return (
    <span
      className={`text-[13px] font-medium tabular-nums ${
        up ? "text-[var(--green-500)]" : "text-[var(--red-500)]"
      }`}
    >
      {up ? "↑" : "↓"}
    </span>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`py-3 px-1 font-code text-[10.5px] font-normal uppercase tracking-wider text-text-tertiary text-left ${className}`}
    >
      {children}
    </th>
  );
}
