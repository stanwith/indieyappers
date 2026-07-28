export const SITE_TITLE = "Top 100 Indies";

/**
 * Native share sheet where available, clipboard fallback elsewhere.
 *
 * Every new argument here defaults to the X board's behaviour, so the /v1
 * board and the existing arcade callers are untouched; the Threads challenge
 * boards pass their own name and URL through.
 */
export function shareSite(onCopy?: () => void, title: string = SITE_TITLE) {
  if (navigator.share) {
    navigator.share({ title, url: globalThis.location.href });
  } else {
    navigator.clipboard.writeText(globalThis.location.href);
    onCopy?.();
  }
}

/**
 * `url` defaults to the origin because the X board IS the root page. A board
 * that lives on a sub-path (a Threads challenge) has to pass its own href, or
 * the shared link lands people on the X leaderboard instead.
 */
export function openPostOnX(text: string, url: string = globalThis.location.origin) {
  globalThis.open(
    `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    "_blank"
  );
}

/** Default post copy: crown the current #1. */
export function loudestPostText(
  top?: { handle: string },
  boardTitle?: string
): string {
  if (boardTitle) {
    return top
      ? `@${top.handle} is leading ${boardTitle} right now. See the board:`
      : `Follow along with ${boardTitle}:`;
  }
  return top
    ? `The loudest builder on the indie timeline right now is @${top.handle}. See the whole board:`
    : "Who's building the loudest on the indie timeline?";
}
