import type { Mode } from "@/lib/types";

const styles: Record<Mode, { label: string; classes: string; title: string }> = {
  Q: {
    label: "Q",
    title: "Quick — X thread, <10 min",
    classes:
      "bg-black/5 text-foreground/70 dark:bg-white/10 dark:text-foreground/80",
  },
  A: {
    label: "A",
    title: "Article — 20-40 min",
    classes:
      "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  },
  H: {
    label: "H",
    title: "Heavy — 1-2 hr+",
    classes:
      "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  },
};

export default function ModeBadge({ mode }: { mode?: Mode }) {
  if (!mode) return null;
  const s = styles[mode];
  return (
    <span
      title={s.title}
      className={`inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${s.classes}`}
    >
      {s.label}
    </span>
  );
}
