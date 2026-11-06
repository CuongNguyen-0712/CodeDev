import { formatNumber } from "@/components/admin/ui/format";
import { cn } from "@/lib/utils";

/**
 * Horizontal share bars: label, value and a bar on a track, all rows on one scale (the largest row, or
 * `max`). Every row is labelled, so it suits short ranked lists and a 1-5 star distribution.
 * rows: [{ key, label, value, detail? }]; detail is a grey note after the value.
 */
export default function HBar({ rows, label, max, className, formatValue = formatNumber }) {
    const scale = Math.max(1, max ?? Math.max(0, ...rows.map((row) => row.value)));
    return (
        <ul className={cn("space-y-2.5", className)} aria-label={label}>
            {rows.map((row) => (
                <li key={row.key} className="grid min-w-0 gap-1">
                    <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate" title={typeof row.label === "string" ? row.label : undefined}>{row.label}</span>
                        <span className="shrink-0 tabular-nums">
                            <span className="font-medium">{formatValue(row.value)}</span>
                            {row.detail && <span className="ml-1.5 text-xs text-muted-foreground">{row.detail}</span>}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary-ink" style={{ width: `${Math.min(100, (row.value / scale) * 100)}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}
