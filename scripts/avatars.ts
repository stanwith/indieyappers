/**
 * Download X profile pictures for every founder into public/avatars/ and
 * point avatar_url at the local copy.
 *
 * Uses the context.dev web scrape API to read each founder's x.com profile
 * page (bot-detection bypass included) and pull the official pbs.twimg.com
 * profile image URL, then downloads the image directly.
 *
 * Run via `npm run avatars` (requires CONTEXT_DEV_API_KEY in .env.local).
 * Skips founders that already have a local copy.
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../lib/db";
import type { FounderRow } from "../lib/types";

const API_BASE = "https://api.context.dev/v1";
const OUT_DIR = path.join(process.cwd(), "public", "avatars");
const DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function apiKey(): string {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error("CONTEXT_DEV_API_KEY is not set in .env.local");
  return key;
}

/** Scrape the profile page and return the full-size profile image URL. */
async function findAvatarUrl(handle: string): Promise<string | null> {
  const params = new URLSearchParams({
    url: `https://x.com/${handle}`,
    includeImages: "true",
    waitForMs: "3000",
  });
  const res = await fetch(`${API_BASE}/web/scrape/markdown?${params}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { markdown?: string };
  // The og:image 400x400 variant is the profile picture; timeline avatars
  // in the page body are _normal (48px) variants of other accounts.
  const match = body.markdown?.match(
    /https:\/\/pbs\.twimg\.com\/profile_images\/[^\s)"\\]+_400x400\.[a-z]+/
  );
  return match?.[0] ?? null;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const db = getDb();
  const founders = db.prepare("SELECT * FROM founders").all() as FounderRow[];
  const update = db.prepare("UPDATE founders SET avatar_url = ? WHERE handle = ?");

  let saved = 0;
  for (const [i, f] of founders.entries()) {
    const localPath = `/avatars/${f.handle}.jpg`;
    const file = path.join(OUT_DIR, `${f.handle}.jpg`);
    if (f.avatar_url === localPath && fs.existsSync(file)) continue;
    if (fs.existsSync(file)) {
      update.run(localPath, f.handle);
      saved++;
      continue;
    }

    try {
      const url = await findAvatarUrl(f.handle);
      if (!url) {
        console.log(`  [${i + 1}/${founders.length}] @${f.handle} -> no avatar found`);
        await sleep(DELAY_MS);
        continue;
      }
      const img = await fetch(url);
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer());
        if (buf.length > 500) {
          fs.writeFileSync(file, buf);
          update.run(localPath, f.handle);
          saved++;
          console.log(`  [${i + 1}/${founders.length}] @${f.handle} saved`);
        }
      } else {
        console.log(`  [${i + 1}/${founders.length}] @${f.handle} image ${img.status}`);
      }
    } catch (err) {
      console.warn(`  [${i + 1}/${founders.length}] @${f.handle} failed:`, err);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done. ${saved} avatars cached locally.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
