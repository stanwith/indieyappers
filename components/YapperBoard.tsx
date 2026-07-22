"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { CompanyEntry, LeaderboardEntry, TimeWindow } from "@/lib/types";
import { formatCompact, formatNumber } from "@/lib/format";
import { Avatar } from "./Avatar";
import { WindowToggle } from "./WindowToggle";

const PAGE_SIZE = 25;

const TIERS = [
  { value: 0, label: "All tiers" },
  { value: 1, label: "Anchor" },
  { value: 2, label: "Core" },
  { value: 3, label: "Community" },
  { value: 4, label: "Rising" },
];

type Tab = "people" | "companies";

export function YapperBoard({
  entries,
  companies,
  window,
  initialTab,
  sessionHandle,
  updatedLabel,
}: {
  entries: LeaderboardEntry[];
  companies: CompanyEntry[];
  window: TimeWindow;
  initialTab: Tab;
  sessionHandle: string | null;
  updatedLabel: string | null;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState(0);
  const [page, setPage] = useState(0);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    return entries.filter((e) => {
      if (tier !== 0 && e.tier !== tier) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.handle.toLowerCase().includes(q) ||
        (e.companyName ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, query, tier]);

  const filteredCompanies = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.domain ?? "").toLowerCase().includes(q) ||
        c.topYapperHandle.toLowerCase().includes(q)
    );
  }, [companies, query]);

  const rows = tab === "people" ? filteredPeople : filteredCompanies;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(0);
    const url = new URL(globalThis.location.href);
    url.searchParams.set("tab", t);
    globalThis.history.replaceState(null, "", url);
  };

  const copyLink = () => navigator.clipboard.writeText(globalThis.location.href);
  const share = () => {
    if (navigator.share) {
      navigator.share({ title: "Yapper Leaderboard", url: globalThis.location.href });
    } else {
      copyLink();
    }
  };
  const postOnX = () => {
    const top = entries[0];
    const text = top
      ? `The biggest yapper on the indie founder timeline right now is @${top.handle}. See the whole board:`
      : "Who's the biggest yapper on the indie founder timeline?";
    globalThis.open(
      `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(globalThis.location.origin)}`,
      "_blank"
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto w-full max-w-md">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="@levelsio"
            className="stanley-input w-full rounded-full py-2.5 pl-10 pr-4 text-sm"
            aria-label="Search the leaderboard"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="stanley-segmented-control">
          {(["companies", "people"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`stanley-segmented-tab cursor-pointer px-3 py-1.5 text-[13px] font-medium capitalize ${
                tab === t ? "is-active" : ""
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === "people" && (
            <select
              value={tier}
              onChange={(e) => {
                setTier(Number(e.target.value));
                setPage(0);
              }}
              className="stanley-control-button cursor-pointer appearance-none px-3 py-1.5 pr-7 text-[13px] font-medium"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2374787f' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
              }}
              aria-label="Filter by tier"
            >
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
          <WindowToggle active={window} />
          <ToolbarButton onClick={copyLink} label="Copy link">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </ToolbarButton>
          <ToolbarButton onClick={share} label="Share">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" x2="12" y1="2" y2="15" />
          </ToolbarButton>
          <ToolbarButton onClick={postOnX} label="Post on X">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
            <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
          </ToolbarButton>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-sm)]">
        {tab === "people" ? (
          <PeopleTable
            rows={pageRows as LeaderboardEntry[]}
            query={query}
            window={window}
            sessionHandle={sessionHandle}
          />
        ) : (
          <CompaniesTable
            rows={pageRows as CompanyEntry[]}
            query={query}
            window={window}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-gray-25 px-5 py-3">
          <span className="font-code text-[11px] text-text-tertiary">
            {rows.length === 0
              ? "0 results"
              : `${safePage * PAGE_SIZE + 1}–${Math.min(
                  (safePage + 1) * PAGE_SIZE,
                  rows.length
                )} of ${formatNumber(rows.length)}`}
            {updatedLabel ? ` · ${updatedLabel}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="stanley-control-button cursor-pointer px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-code text-[11px] text-text-tertiary tabular-nums">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              className="stanley-control-button cursor-pointer px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeopleTable({
  rows,
  query,
  window,
  sessionHandle,
}: {
  rows: LeaderboardEntry[];
  query: string;
  window: TimeWindow;
  sessionHandle: string | null;
}) {
  const router = useRouter();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-subtle bg-gray-25">
          <Th className="w-14 pl-5">#</Th>
          <Th>Person</Th>
          <Th className="hidden md:table-cell">Company</Th>
          <Th className="hidden sm:table-cell">24h</Th>
          <Th className="text-right">Interactions ({window})</Th>
          <Th className="text-right">Impressions ({window})</Th>
          <Th className="w-20 pr-5 text-right"> </Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const isMe =
            sessionHandle !== null &&
            e.handle.toLowerCase() === sessionHandle.toLowerCase();
          return (
          <tr
            key={e.handle}
            onClick={() => router.push(`/company/${e.companySlug}`)}
            className={`cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-[var(--surface-hover-ink)] transition-colors duration-150 ${
              isMe ? "bg-[var(--iris-faint)]" : ""
            }`}
          >
            <td className="py-3 pl-5">
              <span
                className={`text-[13px] tabular-nums ${
                  e.rank <= 3
                    ? "font-semibold text-[var(--iris-700)]"
                    : "text-text-tertiary"
                }`}
              >
                {e.rank}
              </span>
            </td>
            <td className="py-3">
              <span className="flex items-center gap-3 min-w-0">
                <Avatar name={e.name} url={e.avatarUrl} size={34} />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-[13px] font-medium text-text leading-tight">
                      {e.name}
                    </span>
                    {isMe && (
                      <span className="shrink-0 rounded-full bg-[var(--iris-soft)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[var(--iris-700)]">
                        you
                      </span>
                    )}
                  </span>
                  <span className="font-code text-[11px] text-text-tertiary truncate">
                    @{e.handle}
                  </span>
                </span>
              </span>
            </td>
            <td className="hidden md:table-cell py-3 pr-4 max-w-[200px]">
              <CompanyCell name={e.companyName} logo={e.companyLogo} />
            </td>
            <td className="hidden sm:table-cell py-3">
              <RankDelta value={e.rankDelta} />
            </td>
            <td className="py-3 text-right font-code text-[12px] text-text-secondary tabular-nums">
              {formatCompact(e.interactions)}
            </td>
            <td className="py-3 text-right text-[13px] font-semibold text-text tabular-nums">
              {formatCompact(e.impressions)}
            </td>
            <td className="py-3 pr-5 text-right">
              <a
                href={`https://x.com/${e.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                className="stanley-control-button inline-flex px-3 py-1 text-xs font-medium"
              >
                View
              </a>
            </td>
          </tr>
          );
        })}
        {rows.length === 0 && <EmptyRow query={query} colSpan={8} />}
      </tbody>
    </table>
  );
}

function CompaniesTable({
  rows,
  query,
  window,
}: {
  rows: CompanyEntry[];
  query: string;
  window: TimeWindow;
}) {
  const router = useRouter();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border-subtle bg-gray-25">
          <Th className="w-14 pl-5">#</Th>
          <Th>Company</Th>
          <Th className="hidden sm:table-cell w-24 pr-6 text-right">Yappers</Th>
          <Th className="hidden md:table-cell pl-4">Top yapper</Th>
          <Th className="hidden sm:table-cell">24h</Th>
          <Th className="text-right">Impressions ({window})</Th>
          <Th className="w-20 pr-5 text-right"> </Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr
            key={c.slug}
            onClick={() => router.push(`/company/${c.slug}`)}
            className="cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-[var(--surface-hover-ink)] transition-colors duration-150"
          >
            <td className="py-3 pl-5">
              <span
                className={`text-[13px] tabular-nums ${
                  c.rank <= 3
                    ? "font-semibold text-[var(--iris-700)]"
                    : "text-text-tertiary"
                }`}
              >
                {c.rank}
              </span>
            </td>
            <td className="py-3">
              <span className="flex items-center gap-3 min-w-0">
                <CompanyLogo name={c.name} logo={c.logo} size={34} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-medium text-text leading-tight">
                    {c.name}
                  </span>
                  <span className="font-code text-[11px] text-text-tertiary truncate">
                    {c.domain ?? "—"}
                  </span>
                </span>
              </span>
            </td>
            <td className="hidden sm:table-cell py-3 pr-6 text-right font-code text-[11px] text-text-secondary tabular-nums">
              {c.yapperCount}
            </td>
            <td className="hidden md:table-cell py-3 pl-4 pr-4 max-w-[180px]">
              <a
                href={`https://x.com/${c.topYapperHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                className="flex items-center gap-2 min-w-0 hover:opacity-80"
              >
                <Avatar
                  name={c.topYapperName}
                  url={c.topYapperAvatar}
                  size={22}
                />
                <span className="font-code text-[11px] text-text-secondary truncate">
                  @{c.topYapperHandle}
                </span>
              </a>
            </td>
            <td className="hidden sm:table-cell py-3">
              <RankDelta value={c.rankDelta} />
            </td>
            <td className="py-3 text-right text-[13px] font-semibold text-text tabular-nums">
              {formatCompact(c.impressions)}
            </td>
            <td className="py-3 pr-5 text-right">
              <span className="stanley-control-button inline-flex px-3 py-1 text-xs font-medium">
                View
              </span>
            </td>
          </tr>
        ))}
        {rows.length === 0 && <EmptyRow query={query} colSpan={7} />}
      </tbody>
    </table>
  );
}

function CompanyCell({
  name,
  logo,
}: {
  name: string | null;
  logo: string | null;
}) {
  if (!name) return <span className="text-[13px] text-text-tertiary">—</span>;
  return (
    <span className="flex items-center gap-2 min-w-0">
      <CompanyLogo name={name} logo={logo} size={20} />
      <span className="truncate text-[13px] text-text-secondary">{name}</span>
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
        className="shrink-0 rounded-[6px] border border-border-subtle bg-white object-contain"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[6px] border border-border-subtle bg-[var(--surface-sunken)] font-medium text-text-secondary"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function RankDelta({ value }: { value: number | null }) {
  if (value === null || value === 0) {
    return <span className="text-[13px] text-text-tertiary">—</span>;
  }
  const up = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[12px] font-medium tabular-nums ${
        up ? "text-[var(--green-500)]" : "text-[var(--red-500)]"
      }`}
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="currentColor"
        aria-hidden
        style={up ? undefined : { transform: "rotate(180deg)" }}
      >
        <path d="M4 0 8 8 H0 Z" />
      </svg>
      {Math.abs(value)}
    </span>
  );
}

function EmptyRow({ query, colSpan }: { query: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="py-10 text-center text-[13px] text-text-tertiary"
      >
        No results{query.trim() ? ` for "${query.trim()}"` : ""}
      </td>
    </tr>
  );
}

function ToolbarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="stanley-control-button inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
      {label}
    </button>
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
