export const SITE_TITLE = "Top 100 Indies";

/** Native share sheet where available, clipboard fallback elsewhere. */
export function shareSite(onCopy?: () => void) {
  if (navigator.share) {
    navigator.share({ title: SITE_TITLE, url: globalThis.location.href });
  } else {
    navigator.clipboard.writeText(globalThis.location.href);
    onCopy?.();
  }
}

export function openPostOnX(text: string) {
  globalThis.open(
    `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(globalThis.location.origin)}`,
    "_blank"
  );
}

/** Default tweet copy: crown the current #1. */
export function loudestPostText(top?: { handle: string }): string {
  return top
    ? `The loudest builder on the indie timeline right now is @${top.handle}. See the whole board:`
    : "Who's building the loudest on the indie timeline?";
}
