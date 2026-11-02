'use client';

import { formatNumber } from "@/components/admin/ui/format";
import { cn } from "@/lib/utils";

/** Underline tabs on a full-width rule (docs/admin-panel-plan.md 5.5), with an optional count per tab. */
export default function TabBar({ tabs, value, onChange, counts, label }) {
    return (
        // The rule is an inset shadow so the tabs never overflow downwards (which grew a scrollbar); the row
        // still scrolls sideways on a phone, without a visible bar.
        <div role="tablist" aria-label={label} className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={value === item.key}
                    onClick={() => onChange(item.key)}
                    className={cn(
                        "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        value === item.key ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                >
                    {item.label}
                    {counts?.[item.key] != null && <span className="ml-1.5 tabular-nums text-muted-foreground">{formatNumber(counts[item.key])}</span>}
                </button>
            ))}
        </div>
    );
}
