import Image from "next/image";

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full border border-border-subtle object-cover shrink-0"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full border border-border-subtle bg-[var(--surface-sunken)] font-medium text-text-secondary shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials}
    </div>
  );
}
