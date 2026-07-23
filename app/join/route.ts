import { NextResponse } from "next/server";

/**
 * Stable, shareable entry point for joining the leaderboard. Redirects into
 * the OAuth login flow, which mints a fresh single-use X authorize URL per
 * visitor - safe to send to any number of people.
 */
export async function GET(request: Request) {
  return NextResponse.redirect(
    new URL("/api/auth/login", new URL(request.url).origin)
  );
}
