import { cn } from "@/lib/utils";

export function stressTone(value: number): "low" | "mid" | "high" {
  if (value <= 4) return "low";
  if (value <= 6.5) return "mid";
  return "high";
}

const toneBg = { low: "bg-stress-low", mid: "bg-stress-mid", high: "bg-stress-high" } as const;
const toneLabel = { low: "Calm", mid: "Some pressure", high: "High stress" } as const;

export function StressDot({ value, className }: { value: number; className?: string }) {
  return <span className={cn("inline-block size-2.5 rounded-full", toneBg[stressTone(value)], className)} />;
}

/** 10-segment meter for a 1–10 stress score. */
export function StressMeter({ value }: { value: number }) {
  const tone = stressTone(value);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-5xl font-semibold leading-none">{value}</span>
        <span className="text-muted-foreground">/ 10</span>
        <span className="ml-auto text-sm font-medium text-muted-foreground">{toneLabel[tone]}</span>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className={cn("h-2 flex-1 rounded-full", i < value ? toneBg[tone] : "bg-muted")}
          />
        ))}
      </div>
    </div>
  );
}
