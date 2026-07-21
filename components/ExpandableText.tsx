"use client";

import { useState } from "react";

export function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 220;

  return (
    <p className="text-[13px] leading-relaxed text-text-secondary">
      {isLong && !open ? `${text.slice(0, 220).trimEnd()}…` : text}
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="ml-1.5 cursor-pointer font-medium text-text underline-offset-2 hover:underline"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </p>
  );
}
