/** URL slug for a company: prefers domain, falls back to name. */
export function companySlug(domain: string | null, name: string): string {
  const base = (domain ?? name).toLowerCase().trim();
  return base.replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
}
