import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { Avatar } from "./Avatar";

export async function TopNav() {
  const user = await getSessionUser();

  return (
    <nav className="sticky top-0 z-20 border-b border-border-subtle bg-[var(--surface-glass-strong)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/stanley-mascot-2.png"
            alt="Stanley"
            width={30}
            height={31}
            className="h-[31px] w-[30px] select-none object-contain"
            priority
          />
          <span className="text-sm font-semibold tracking-tight text-text">
            Indie Hot 100
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/about"
            className="hidden text-[13px] font-medium text-text-secondary transition-colors hover:text-text sm:block"
          >
            About
          </Link>
          {user && (
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
          )}
          <a
            href="https://x.getstanley.ai/e/indie-hacker-x-stanley"
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
