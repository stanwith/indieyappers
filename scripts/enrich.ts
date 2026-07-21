/**
 * Enrich founders with company data from the context.dev Brand API:
 * company domain, logo, and short description, looked up by product name.
 * Run via `npm run enrich` (requires CONTEXT_DEV_API_KEY in .env.local).
 */
import { getDb } from "../lib/db";
import type { FounderRow } from "../lib/types";

const API_BASE = "https://api.context.dev/v1";

interface BrandLogo {
  url: string;
  mode?: string;
  type?: string;
}

interface BrandResponse {
  status?: string;
  brand?: {
    title?: string;
    domain?: string;
    description?: string;
    logos?: BrandLogo[];
  };
}

/**
 * Products whose names don't resolve via by_name lookup; we know the domain,
 * so retry those with a by_domain lookup instead.
 */
const DOMAIN_HINTS: Record<string, string> = {
  nico_jeannen: "talknotes.io",
  thekitze: "sizzy.co",
  arvidkahl: "feedbackpanda.com",
  jdnoc: "closet.tools",
  TweetsOfSumit: "parqet.com",
  jamesivings: "leavemealone.com",
  gmcconnaughey: "postpone.app",
  jakobgreenfeld: "businessbrainstorms.com",
  // Corrections for wrong by_name matches:
  DanKulkov: "makerbox.club",
  florinpop1705: "florin-pop.com",
};

function apiKey(): string {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) {
    throw new Error("CONTEXT_DEV_API_KEY is not set in .env.local");
  }
  return key;
}

/** First product name in the seed's "Product / known for" field. */
function primaryProduct(product: string): string {
  return product
    .split(/[,;+]/)[0]
    .replace(/\(.*?\)/g, "")
    .replace(/\b(exit|sold|acquired)\b.*$/i, "")
    .trim();
}

async function lookupBrand(
  body: { type: "by_name"; name: string } | { type: "by_domain"; domain: string }
): Promise<BrandResponse | null> {
  const res = await fetch(`${API_BASE}/brand/retrieve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return (await res.json()) as BrandResponse;
}

function pickLogo(logos: BrandLogo[] | undefined): string | null {
  if (!logos?.length) return null;
  // Our UI is light, so prefer light-theme/opaque icons (dark-theme logos
  // are often white-on-transparent and vanish on white tiles).
  const icon =
    logos.find((l) => l.type === "icon" && l.mode === "light") ??
    logos.find((l) => l.type === "icon" && l.mode === "has_opaque_background") ??
    logos.find((l) => l.type === "icon") ??
    logos.find((l) => l.mode === "light") ??
    logos[0];
  return icon?.url ?? null;
}

async function main() {
  const db = getDb();
  const founders = db
    .prepare("SELECT * FROM founders WHERE company_logo IS NULL")
    .all() as FounderRow[];
  console.log(`Enriching ${founders.length} founders via context.dev...`);

  const update = db.prepare(
    "UPDATE founders SET company_domain = ?, company_logo = ?, company_desc = ? WHERE handle = ?"
  );

  let hits = 0;
  for (const [i, f] of founders.entries()) {
    try {
      // Domain hint first, then each product segment by name.
      const attempts: Parameters<typeof lookupBrand>[0][] = [];
      const hint = DOMAIN_HINTS[f.handle] ?? f.company_domain;
      if (hint) attempts.push({ type: "by_domain", domain: hint });
      for (const segment of f.product.split(/[,;+]/)) {
        const name = segment
          .replace(/\(.*?\)/g, "")
          .replace(/\b(exit|sold|acquired|new builds?|educator|exits)\b.*$/i, "")
          .trim();
        if (name.length > 2) attempts.push({ type: "by_name", name });
      }

      let matched = false;
      for (const attempt of attempts) {
        const data = await lookupBrand(attempt);
        const brand = data?.brand;
        const logo = pickLogo(brand?.logos);
        if (brand?.domain && logo) {
          update.run(brand.domain, logo, brand.description ?? null, f.handle);
          hits++;
          matched = true;
          console.log(
            `  [${i + 1}/${founders.length}] @${f.handle} -> ${brand.domain}`
          );
          break;
        }
      }
      if (!matched) {
        console.log(`  [${i + 1}/${founders.length}] @${f.handle} -> no match`);
      }
    } catch (err) {
      console.warn(`  [${i + 1}/${founders.length}] @${f.handle} failed:`, err);
    }
  }

  console.log(`Done. ${hits}/${founders.length} enriched.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
