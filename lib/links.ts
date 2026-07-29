/**
 * The join funnel starts here: everyone messages Stanley, and Stanley hands
 * out the tokenized /join URL. Client-safe single home for the URL — the join
 * gate redirects here, so a stale copy would break signup outright.
 */
export const STANLEY_LINK = "https://x.getstanley.ai/e/indie-hacker-x-stanley";

/**
 * Which board is on the CRT. The arcade is one renderer serving two data
 * sources: the X yap board at `/` and a Stanley Threads challenge at
 * `/threads/<slug>`. This decides profile links, the views column header,
 * and which stats the detail screen can actually fill.
 */
export type Platform = "x" | "threads";

/** Public profile URL for a board entry. */
export function profileUrl(platform: Platform, handle: string): string {
  return platform === "threads"
    ? `https://www.threads.com/@${handle}`
    : `https://x.com/${handle}`;
}
