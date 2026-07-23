import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "About — Yapper",
  description: "Why Stanley keeps score of the indie founder timeline.",
};

export default function AboutPage() {
  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-14 sm:px-8">
        <header className="flex flex-col items-start">
          <Image
            src="/stanley-wings.png"
            alt="Stanley"
            width={67}
            height={68}
            className="h-[68px] w-[67px] select-none object-contain"
            priority
          />
          <p className="stanley-kicker mt-6">About · Yapper</p>
          <h1 className="mt-1.5 font-display text-4xl leading-tight text-text">
            Stanley made this.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
            Stanley grows your following across platforms while you focus on
            the work you love. Between posts, he keeps an eye on the corner of
            X where indie founders build in public. He noticed that the people
            who measure everything (revenue, streaks, followers) had no
            scoreboard for the thing they do most: posting. So he made one.
          </p>
        </header>

        <section className="mt-12">
          <h2 className="font-display text-xl leading-tight text-text">
            How it works
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
            Stanley follows 100 hand-picked indie founders and counts what
            each of them ships to the timeline over the last 7 and 30 days.
            Not everything yaps equally: an original post counts in full, a
            reply counts half, and a repost counts a quarter. That weighted
            total is the <span className="font-medium text-text">yap score</span>.
            The board ranks everyone by the reach their posting earns, and the
            green and red arrows show who&apos;s heating up or cooling off
            between refreshes.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl leading-tight text-text">
            Want in?
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
            Think someone belongs on the board, or want Stanley yapping on
            your behalf? He&apos;s one message away.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href="https://x.getstanley.ai/e/indie-hacker-x-stanley"
              target="_blank"
              rel="noopener noreferrer"
              className="stanley-brand-action inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
            >
              Message Stanley
            </a>
            <Link
              href="/"
              className="stanley-control-button inline-flex px-4 py-2 text-sm font-medium"
            >
              Back to the board
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
