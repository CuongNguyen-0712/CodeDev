'use client';

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import PageHeader from "@/components/admin/shell/pageHeader";
import { useUrlFilters } from "@/components/admin/ui/useUrlFilters";
import { formatNumber } from "@/components/admin/ui/format";
import { Button } from "@/components/shadcn/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/shadcn/sheet";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";
import { plural } from "@/components/admin/ui/finding";

const RANGES = [{ key: "1h", label: "1 hour" }, { key: "24h", label: "24 hours" }, { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "all", label: "All" }];
const TARGET_LINKS = {
    user: (id) => `/admin/users/${encodeURIComponent(id)}`,
    code_run: (id) => `/admin/runs/${encodeURIComponent(id)}`,
    course: (id) => `/admin/courses/${encodeURIComponent(id)}`,
};

const stamp = (value) => {
    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
const show = (value) => (value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value));

/** The audit screen's finding: volume over the facet window and where most of it went. */
function auditFinding(facets, range) {
    const total = facets.actions.reduce((sum, item) => sum + item.count, 0);
    const target = facets.targets?.[0];
    const actor = facets.actors?.[0];
    // The facets are counted over the range the list shows (db/adminAudit.db.js).
    const window = range === "all" ? "in all" : `in the last ${RANGES.find((item) => item.key === range)?.label || "7 days"}`;
    return `${plural(total, "change")} ${window}${target ? `, most often to ${target.value} (${formatNumber(target.count)})` : ""}${actor ? `, most by ${actor.value}` : ""}.`;
}

function FilterGroup({ title, items, value, onChange }) {
    if (!items?.length) return null;
    return (
        <div className="space-y-1">
            <h2 className="px-2 text-xs text-muted-foreground">{title}</h2>
            <ul className="list-none">
                {items.map((item) => (
                    <li key={item.value}>
                        <button
                            type="button"
                            aria-pressed={value === item.value}
                            onClick={() => onChange(value === item.value ? "" : item.value)}
                            className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                value === item.value ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <span className="truncate">{item.value}</span>
                            <span className="tabular-nums text-xs">{formatNumber(item.count)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Before / after by key, changed keys marked (docs/admin-panel-plan.md 5.5). */
function Diff({ before, after }) {
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
    if (keys.length === 0) return <p className="text-sm text-muted-foreground">No values recorded for this entry.</p>;
    return (
        <table className="w-full table-fixed text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="w-1/4 py-1 font-normal">Field</th><th className="py-1 font-normal">Before</th><th className="py-1 font-normal">After</th></tr></thead>
            <tbody className="divide-y divide-border">
                {keys.map((key) => {
                    const changed = show(before?.[key]) !== show(after?.[key]);
                    return (
                        <tr key={key} className={changed ? "bg-warning-soft/40" : ""}>
                            <th scope="row" className="py-1.5 pr-2 text-left font-mono text-xs font-normal">{key}{changed && <span className="sr-only"> (changed)</span>}</th>
                            <td className="break-words py-1.5 pr-2 font-mono text-xs">{show(before?.[key])}</td>
                            <td className="break-words py-1.5 font-mono text-xs">{show(after?.[key])}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export default function AuditPage() {
    const [filters, update] = useUrlFilters({ range: RANGES.map((item) => item.key), actor: 255, action: 60, target: 40, targetId: 100 }, { range: "7d" });
    const [open, setOpen] = useState(null);
    const query = useInfiniteQuery({
        queryKey: [...adminKeys.audit(), filters],
        queryFn: ({ pageParam }) => adminClient.getAudit({ ...filters, before: pageParam }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextBefore,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });
    const pages = query.data?.pages || [];
    const entries = pages.flatMap((page) => page.items);
    const facets = pages[0]?.facets;
    const filtered = Boolean(filters.actor || filters.action || filters.target || filters.targetId);
    const facetGroups = (
        <>
            <FilterGroup title="Action" items={facets?.actions} value={filters.action} onChange={(value) => update({ action: value })} />
            <FilterGroup title="Target" items={facets?.targets} value={filters.target} onChange={(value) => update({ target: value })} />
            <FilterGroup title="Actor" items={facets?.actors} value={filters.actor} onChange={(value) => update({ actor: value })} />
        </>
    );

    return (
        <>
            <PageHeader
                title="Audit"
                description={facets?.actions?.length ? auditFinding(facets, filters.range) : "Every privileged change, newest first. The log is append-only."}
                actions={filtered && <Button variant="outline" size="sm" onClick={() => update({ actor: "", action: "", target: "", targetId: "" })}>Clear filters</Button>}
            />
            <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6">
                <aside className="space-y-5" aria-label="Filters">
                    <div className="space-y-1">
                        <h2 className="px-2 text-xs text-muted-foreground">Time</h2>
                        <div className="flex flex-wrap gap-1 px-1">
                            {RANGES.map((range) => (
                                <button
                                    key={range.key}
                                    type="button"
                                    aria-pressed={filters.range === range.key}
                                    onClick={() => update({ range: range.key })}
                                    className={cn("rounded-md px-2 py-1.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", filters.range === range.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                                >
                                    {range.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Below lg the facet lists fold away so the log itself is on the first screen. */}
                    <details className="group rounded-md lg:hidden">
                        <summary className="cursor-pointer rounded-md px-2 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                            Filter by action, target or actor
                        </summary>
                        <div className="mt-3 space-y-5">{facetGroups}</div>
                    </details>
                    <div className="hidden space-y-5 lg:block">{facetGroups}</div>
                    {filters.targetId && <p className="px-2 text-xs text-muted-foreground">Only <span className="font-mono">{filters.targetId}</span></p>}
                </aside>

                <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card" aria-label="Audit entries" aria-busy={query.isPending}>
                    {query.isPending ? (
                        <div className="space-y-2 p-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-6 w-full" />)}</div>
                    ) : query.isError ? (
                        <p className="p-4 text-sm">Couldn&apos;t load the audit log. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                    ) : entries.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">
                            No entry matches these filters.{" "}
                            {filtered && <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => update({ actor: "", action: "", target: "", targetId: "" })}>Clear filters</button>}
                        </p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {entries.map((entry) => (
                                <li key={entry.id}>
                                    <button type="button" onClick={() => setOpen(entry)} className="grid w-full grid-cols-[10.5rem_minmax(0,1fr)] gap-3 px-4 py-2 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:grid-cols-[10.5rem_11rem_minmax(0,1fr)]">
                                        <time dateTime={entry.created_at} className="font-mono text-xs leading-5 text-muted-foreground">{stamp(entry.created_at)}</time>
                                        <span className="truncate font-mono text-xs leading-5">{entry.action}</span>
                                        <span className="col-span-2 min-w-0 truncate sm:col-span-1">
                                            <span className="text-muted-foreground">{entry.actor || "system"} →</span> {entry.target_type} <span className="font-mono text-xs">{entry.target_id}</span>
                                            {entry.reason && <span className="text-muted-foreground"> · “{entry.reason}”</span>}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {query.hasNextPage && (
                        <div className="border-t border-border p-3 text-center">
                            <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>{query.isFetchingNextPage ? "Loading…" : "Load older"}</Button>
                        </div>
                    )}
                </section>
            </div>

            <Sheet open={Boolean(open)} onOpenChange={(value) => !value && setOpen(null)}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                    {open && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="font-mono text-base">{open.action}</SheetTitle>
                                <SheetDescription>{stamp(open.created_at)} by {open.actor || "system"}</SheetDescription>
                            </SheetHeader>
                            <div className="space-y-5 px-4 pb-6">
                                <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2 text-sm">
                                    <dt className="text-muted-foreground">Target</dt>
                                    <dd className="min-w-0 break-words">
                                        {open.target_type} <span className="font-mono text-xs">{open.target_id}</span>
                                        {TARGET_LINKS[open.target_type] && <> · <Link href={TARGET_LINKS[open.target_type](open.target_id)} className="text-primary-ink hover:underline">Open</Link></>}
                                        {" · "}<button type="button" className="text-primary-ink hover:underline" onClick={() => { update({ target: open.target_type, targetId: open.target_id }); setOpen(null); }}>Only this target</button>
                                    </dd>
                                    <dt className="text-muted-foreground">Reason</dt><dd className="break-words">{open.reason || "—"}</dd>
                                    <dt className="text-muted-foreground">IP address</dt><dd className="font-mono text-xs">{open.ip_address || "—"}</dd>
                                </dl>
                                <Diff before={open.before} after={open.after} />
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}
