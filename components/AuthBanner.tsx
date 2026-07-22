"use client";

import { useEffect, useState } from "react";

export function AuthBanner({
  status,
  handle,
  rank,
  total,
}: {
  status: "ok" | "failed";
  handle?: string;
  rank?: number | null;
  total?: number;
}) {
  const [visible, setVisible] = useState(true);

  // Clean the ?auth= param so refreshes/shares don't re-show the banner.
  useEffect(() => {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete("auth");
    globalThis.history.replaceState(null, "", url);
  }, []);

  if (!visible) return null;

  if (status === "failed") {
    return (
      <div className="mx-auto mb-8 flex max-w-xl items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-[var(--red-soft)] px-4 py-3 shadow-[var(--shadow-xs)]">
        <p className="text-[13px] text-text">
          Sign in didn&apos;t complete. Give it another shot.
        </p>
        <DismissButton onClick={() => setVisible(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto mb-8 flex max-w-xl items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-[var(--green-soft)] px-4 py-3 shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--green-500)] text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <p className="text-[13px] leading-snug text-text">
          <span className="font-semibold">You&apos;re in.</span>{" "}
          {handle ? <>@{handle} is on the leaderboard</> : "You're on the leaderboard"}
          {rank && total ? (
            <>
              {" "}
              — currently{" "}
              <span className="font-semibold tabular-nums">
                #{rank}
              </span>{" "}
              of {total}.
            </>
          ) : (
            "."
          )}{" "}
          <span className="text-text-secondary">
            Your yaps start counting from the next refresh.
          </span>
        </p>
      </div>
      <DismissButton onClick={() => setVisible(false)} />
    </div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss"
      className="shrink-0 cursor-pointer rounded-full p-1 text-text-tertiary transition-colors hover:bg-[var(--surface-hover-ink)] hover:text-text"
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
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  );
}
