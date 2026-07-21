import Link from "next/link";
import type { TimeWindow } from "@/lib/types";

const OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export function WindowToggle({ active }: { active: TimeWindow }) {
  return (
    <div className="stanley-segmented-control">
      {OPTIONS.map((opt) => (
        <Link
          key={opt.value}
          href={opt.value === "7d" ? "/" : `/?window=${opt.value}`}
          className={`stanley-segmented-tab px-3 py-1.5 text-[13px] font-medium ${
            active === opt.value ? "is-active" : ""
          }`}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
