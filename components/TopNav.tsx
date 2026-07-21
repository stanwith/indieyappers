import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { Avatar } from "./Avatar";

function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export async function TopNav() {
  const user = await getSessionUser();

  return (
    <nav className="sticky top-0 z-20 border-b border-border-subtle bg-[var(--surface-glass-strong)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/stanley-orb.png"
            alt="Stanley"
            width={26}
            height={31}
            className="h-[31px] w-[26px] select-none object-contain"
            priority
          />
          <span className="text-sm font-semibold tracking-tight text-text">
            Yapper Leaderboard
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/about"
            className="hidden text-[13px] font-medium text-text-secondary transition-colors hover:text-text sm:block"
          >
            About
          </Link>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="stanley-control-button inline-flex items-center gap-2 py-1 pl-1.5 pr-3 text-[13px] font-medium">
                <Avatar name={user.name} url={user.avatar_url} size={22} />
                @{user.handle}
              </span>
              <a
                href="/api/auth/logout"
                className="text-[12px] font-medium text-text-tertiary transition-colors hover:text-text"
              >
                Sign out
              </a>
            </div>
          ) : (
            <a
              href="/api/auth/login"
              className="stanley-primary-action inline-flex items-center gap-2 px-3.5 py-1.5 text-[13px] font-medium"
            >
              <XGlyph />
              Sign in with X
            </a>
          )}
          <a
            href="https://www.getstanley.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="stanley-brand-action inline-flex items-center gap-2 px-3.5 py-1.5 text-[13px] font-medium"
          >
            Message Stanley
          </a>
        </div>
      </div>
    </nav>
  );
}
