import { NextResponse, type NextRequest } from "next/server";
import { JOIN_COOKIE, joinGate } from "@/lib/auth";

/**
 * Entry point for joining the leaderboard — but only via Stanley: the join
 * URL Stanley hands out in conversation carries ?t=<JOIN_TOKEN>. Anything
 * without a valid token is funneled back to the Stanley conversation.
 * The token travels on to the OAuth login as a short-lived cookie, so the
 * login route can't be hit directly either.
 */
export async function GET(request: NextRequest) {
  const denied = joinGate(request);
  if (denied) return denied;

  const res = NextResponse.redirect(new URL("/api/auth/login", request.url));
  const token = request.nextUrl.searchParams.get("t");
  if (token) {
    res.cookies.set(JOIN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 600,
      path: "/",
    });
  }
  return res;
}
