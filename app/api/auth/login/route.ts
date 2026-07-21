import { NextResponse } from "next/server";
import {
  oauthConfig,
  generateVerifier,
  challengeFor,
  generateState,
  VERIFIER_COOKIE,
  STATE_COOKIE,
} from "@/lib/auth";

export async function GET(request: Request) {
  const config = oauthConfig();
  if (!config) {
    return NextResponse.json(
      { error: "X_CLIENT_ID / X_CLIENT_SECRET are not set in .env.local" },
      { status: 500 }
    );
  }

  const verifier = generateVerifier();
  const state = generateState();

  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "tweet.read users.read follows.read offline.access");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challengeFor(verifier));
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url);
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.url).protocol === "https:",
    maxAge: 600,
    path: "/",
  };
  res.cookies.set(VERIFIER_COOKIE, verifier, cookieOpts);
  res.cookies.set(STATE_COOKIE, state, cookieOpts);
  return res;
}
