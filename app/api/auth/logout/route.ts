import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";

export async function GET(request: Request) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);

  const res = NextResponse.redirect(new URL("/", new URL(request.url).origin));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
