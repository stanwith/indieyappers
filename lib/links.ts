/**
 * The join funnel starts here: everyone messages Stanley, and Stanley hands
 * out the tokenized /join URL. Client-safe single home for the URL — the join
 * gate redirects here, so a stale copy would break signup outright.
 */
export const STANLEY_LINK = "https://x.getstanley.ai/e/indie-hacker-x-stanley";
