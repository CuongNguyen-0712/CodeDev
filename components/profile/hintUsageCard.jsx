import Link from "next/link";
import { LuLightbulb } from "react-icons/lu";

import { formatDate } from "@/components/commerce/format";
import { cn } from "@/lib/utils";

const BUCKETS = [
    { key: "noHint", label: "No hints", bar: "bg-success", dot: "bg-success" },
    { key: "light", label: "Hints 1-2", bar: "bg-info", dot: "bg-info" },
    { key: "assisted", label: "Hint 3 (half EXP)", bar: "bg-warning", dot: "bg-warning" },
];

/** The learner's own hint use on passed coding challenges (hints opened before the first pass). */
export default function HintUsageCard({ usage }) {
    if (!usage) return null;
    const { passed, averageHints, recentAssisted } = usage;

    return (
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card lg:col-span-3">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h2 id="hint-usage-heading" className="text-sm font-semibold text-foreground">Hint usage</h2>
                <span className="text-xs text-muted-foreground tabular">
                    {passed} coding challenge{passed === 1 ? "" : "s"} passed
                </span>
            </div>

            {passed === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                    Pass a coding challenge to see how often you needed a hint.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4 p-4">
                    <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        {BUCKETS.map((b) => usage[b.key] > 0 && (
                            <span key={b.key} className={b.bar} style={{ width: `${(usage[b.key] / passed) * 100}%` }} />
                        ))}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {BUCKETS.map((b) => (
                            <div key={b.key} className="min-w-0">
                                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className={cn("size-2 shrink-0 rounded-full", b.dot)} aria-hidden="true" />
                                    <span className="truncate">{b.label}</span>
                                </dt>
                                <dd className="text-lg font-semibold tabular text-foreground">{usage[b.key]}</dd>
                            </div>
                        ))}
                        <div className="min-w-0">
                            <dt className="text-xs text-muted-foreground">Hints per challenge</dt>
                            <dd className="text-lg font-semibold tabular text-foreground">{averageHints}</dd>
                        </div>
                    </dl>

                    {recentAssisted.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-medium text-muted-foreground">Recent passes after hint 3</h3>
                            <ul className="list-none divide-y divide-border/60 rounded-lg border">
                                {recentAssisted.map((item) => (
                                    <li key={item.challengeId}>
                                        <Link
                                            href={item.href}
                                            className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                        >
                                            <LuLightbulb className="size-4 shrink-0 text-warning" aria-hidden="true" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-medium text-foreground">{item.title}</span>
                                                {item.lessonTitle && (
                                                    <span className="block truncate text-xs text-muted-foreground">{item.lessonTitle}</span>
                                                )}
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.passedAt)}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
