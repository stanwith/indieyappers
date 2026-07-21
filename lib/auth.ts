import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import type { FounderRow } from "./types";

export const SESSION_COOKIE = "yapper_session";
export const VERIFIER_COOKIE = "x_oauth_verifier";
export const STATE_COOKIE = "x_oauth_state";

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

export function createSession(handle: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  getDb()
    .prepare("INSERT INTO sessions (token, handle, created_at) VALUES (?, ?, ?)")
    .run(token, handle, new Date().toISOString());
  return token;
}

export function destroySession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export async function getSessionUser(): Promise<FounderRow | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT f.* FROM sessions s JOIN founders f ON f.handle = s.handle
       WHERE s.token = ?`
    )
    .get(token) as FounderRow | undefined;
  return row ?? null;
}
