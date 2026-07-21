const TIER_LABELS: Record<number, string> = {
  1: "anchor",
  2: "core",
  3: "community",
  4: "rising",
};

export function TierBadge({ tier }: { tier: number }) {
  const isAnchor = tier === 1;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-px text-[11px] font-medium ${
        isAnchor
          ? "bg-[var(--iris-soft)] text-[var(--iris-700)]"
          : "bg-gray-100 text-text-secondary"
      }`}
    >
      {TIER_LABELS[tier] ?? "—"}
    </span>
  );
}
