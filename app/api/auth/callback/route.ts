import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  oauthConfig,
  createSession,
  SESSION_COOKIE,
  VERIFIER_COOKIE,
  STATE_COOKIE,
} from "@/lib/auth";
import {
  pgConfigured,
  pgUpsertJoinedFounder,
  pgUpdateJoinedMetrics,
} from "@/lib/pgstore";
import { computeJoinedMetrics } from "@/lib/enroll";

interface XMe {
  data?: {
    id: string;
    username: string;
    name: string;
    profile_image_url?: string;
    public_metrics?: { followers_count: number; tweet_count: number };
  };
}

export async function GET(request: Request) {
  const config = oauthConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieHeader = request.headers.get("cookie") ?? "";
  const readCookie = (name: string) =>
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);

  const verifier = readCookie(VERIFIER_COOKIE);
  const expectedState = readCookie(STATE_COOKIE);

  if (!config || !code || !state || !verifier || state !== expectedState) {
    return NextResponse.redirect(new URL("/?auth=failed", url.origin));
  }

  // Exchange the code for an access token (confidential client: Basic auth).
  const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${config.clientId}:${config.clientSecret}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) {
    console.error("token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/?auth=failed", url.origin));
  }
  const { access_token, refresh_token } = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
  };

  const meRes = await fetch(
    "https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics",
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!meRes.ok) {
    console.error("users/me failed:", await meRes.text());
    return NextResponse.redirect(new URL("/?auth=failed", url.origin));
  }
  const me = ((await meRes.json()) as XMe).data;
  if (!me) {
    return NextResponse.redirect(new URL("/?auth=failed", url.origin));
  }

  // Attach them to the board: link if already tracked, otherwise enroll.
  const db = getDb();
  const avatar = me.profile_image_url?.replace("_normal", "") ?? null;
  const existing = db
    .prepare("SELECT handle FROM founders WHERE LOWER(handle) = LOWER(?)")
    .get(me.username) as { handle: string } | undefined;

  // With shared Postgres configured (production), the durable record lives
  // there; the local SQLite path below only serves development.
  if (pgConfigured()) {
    const handle = existing?.handle ?? me.username;
    await pgUpsertJoinedFounder({
      handle,
      name: me.name,
      x_user_id: me.id,
      avatar_url: avatar,
      followers: me.public_metrics?.followers_count ?? null,
      oauth_access_token: access_token,
      oauth_refresh_token: refresh_token ?? null,
    });

    // Immediate placement: pull their last 30 days so they rank accurately
    // right away instead of sitting at zero until the nightly refresh.
    // Only needed for accounts that aren't already tracked in the seed data.
    if (!existing) {
      try {
        const metrics = await computeJoinedMetrics(me.id);
        await pgUpdateJoinedMetrics(handle, metrics, null);
      } catch (err) {
        console.error(`instant metrics fetch failed for @${handle}:`, err);
      }
    }

    const token = await createSession(handle);
    const res = NextResponse.redirect(new URL("/?auth=ok", url.origin));
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    res.cookies.delete(VERIFIER_COOKIE);
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  let handle: string;
  if (existing) {
    handle = existing.handle;
    db.prepare(
      `UPDATE founders SET x_user_id = ?, avatar_url = COALESCE(?, avatar_url),
        followers = ?, profile_updated_at = ?,
        oauth_access_token = ?, oauth_refresh_token = ? WHERE handle = ?`
    ).run(
      me.id,
      avatar,
      me.public_metrics?.followers_count ?? null,
      new Date().toISOString(),
      access_token,
      refresh_token ?? null,
      handle
    );
  } else {
    handle = me.username;
    db.prepare(
      `INSERT INTO founders (
        handle, name, product, tier, tier_label, approx_followers, notes,
        x_user_id, avatar_url, followers, lifetime_tweet_count,
        profile_updated_at, joined_via_x, oauth_access_token, oauth_refresh_token
      ) VALUES (?, ?, '', 4, '4 - Rising (<10K)', ?, 'Joined via sign in with X',
        ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      handle,
      me.name,
      me.public_metrics?.followers_count ?? null,
      me.id,
      avatar,
      me.public_metrics?.followers_count ?? null,
      me.public_metrics?.tweet_count ?? null,
      new Date().toISOString(),
      access_token,
      refresh_token ?? null
    );
  }

  const token = await createSession(handle);
  const res = NextResponse.redirect(new URL("/?auth=ok", url.origin));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  res.cookies.delete(VERIFIER_COOKIE);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
