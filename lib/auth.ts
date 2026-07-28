import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { STANLEY_LINK } from "./links";
import { getDb } from "./db";
import {
  pgConfigured,
  pgCreateSession,
  pgDestroySession,
  pgGetJoinedFounder,
  pgSessionHandle,
} from "./pgstore";
import type { FounderRow } from "./types";

export const SESSION_COOKIE = "yapper_session";
export const VERIFIER_COOKIE = "x_oauth_verifier";
export const STATE_COOKIE = "x_oauth_state";
export const JOIN_COOKIE = "yapper_join";

/**
 * Joining is gated: /join and the OAuth login only proceed with the token
 * Stanley hands out in conversation (?t=... on the join URL, carried onward
 * as a short-lived cookie). With JOIN_TOKEN unset (local dev), the gate is
 * open.
 * ponytail: static shared secret — the URL Stanley gives out is forwardable;
 * upgrade to short-lived minted tokens when Stanley's side can sign them.
 */
export function joinTokenValid(token: string | null | undefined): boolean {
  const expected = process.env.JOIN_TOKEN;
  if (!expected) return true;
  return !!token && crypto.timingSafeEqual(
    crypto.createHash("sha256").update(token).digest(),
    crypto.createHash("sha256").update(expected).digest()
  );
}

/** The gate itself: null = proceed, otherwise the redirect into the funnel. */
export function joinGate(request: NextRequest): NextResponse | null {
  const token =
    request.nextUrl.searchParams.get("t") ??
    request.cookies.get(JOIN_COOKIE)?.value;
  return joinTokenValid(token) ? null : NextResponse.redirect(STANLEY_LINK);
}

export function oauthConfig() {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri =
    process.env.X_REDIRECT_URI ?? "http://localhost:3000/api/auth/callback";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function generateVerifier(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function challengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function createSession(handle: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  if (pgConfigured()) {
    await pgCreateSession(token, handle);
  } else {
    getDb()
      .prepare("INSERT INTO sessions (token, handle, created_at) VALUES (?, ?, ?)")
      .run(token, handle, new Date().toISOString());
  }
  return token;
}

export async function destroySession(token: string): Promise<void> {
  if (pgConfigured()) {
    await pgDestroySession(token);
  } else {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
}

export async function getSessionUser(): Promise<FounderRow | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  if (pgConfigured()) {
    const handle = await pgSessionHandle(token);
    if (!handle) return null;
    // Seed founders live in the bundled SQLite; sign-ups live in Postgres.
    const seed = getDb()
      .prepare("SELECT * FROM founders WHERE LOWER(handle) = LOWER(?)")
      .get(handle) as FounderRow | undefined;
    if (seed) return seed;
    const joined = await pgGetJoinedFounder(handle);
    if (!joined) return null;
    return joinedToFounderRow(joined);
  }

  const row = getDb()
    .prepare(
      `SELECT f.* FROM sessions s JOIN founders f ON f.handle = s.handle
       WHERE s.token = ?`
    )
    .get(token) as FounderRow | undefined;
  return row ?? null;
}

function joinedToFounderRow(j: {
  handle: string;
  name: string;
  x_user_id: string;
  avatar_url: string | null;
  followers: number | null;
}): FounderRow {
  return {
    handle: j.handle,
    name: j.name,
    product: "",
    tier: 4,
    tier_label: "4 - Rising (<10K)",
    approx_followers: j.followers,
    notes: "Joined via sign in with X",
    x_user_id: j.x_user_id,
    avatar_url: j.avatar_url,
    followers: j.followers,
    lifetime_tweet_count: null,
    profile_updated_at: null,
    company_domain: null,
    company_logo: null,
    company_desc: null,
    banner_url: null,
  };
}
