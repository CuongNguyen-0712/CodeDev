'use client';

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useAdminCancelRun, useAdminExpireRuns } from "@/mutations/premium.mutation";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import PageHeader from "@/components/admin/shell/pageHeader";
import Finding, { plural } from "@/components/admin/ui/finding";
import StatusDot from "@/components/admin/ui/statusDot";
import TabBar from "@/components/admin/ui/tabBar";
import { useUrlFilters } from "@/components/admin/ui/useUrlFilters";
import { formatDuration, formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Button } from "@/components/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import RowAction from "@/components/admin/ui/rowAction";
import { cn } from "@/lib/utils";

import { LuX } from "react-icons/lu";

const TABS = [
    { key: "active", label: "Active" },
    { key: "failed", label: "Failed" },
    { key: "timeout", label: "Timed out" },
    { key: "all", label: "Last 7 days" },
];
const LANGUAGES = ["javascript", "typescript", "python", "java", "c", "cpp", "go", "rust", "php", "kotlin", "csharp", "sql"];
const SLOW_WAIT_SEC = 60;

/** Queue per sandbox (the screen's signature element, docs/admin-panel-plan.md 5.5). */
export function QueueStrip({ queue }) {
    if (!queue?.length) {
        return <p className="mb-6 rounded-lg border border-border bg-card px-5 py-4 text-sm text-muted-foreground">No run is waiting or running. The queue is clear.</p>;
    }
    return (
        <section aria-label="Queue per sandbox" className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
                {queue.map((lane) => {
                    const slow = lane.oldest_wait_sec > SLOW_WAIT_SEC;
                    return (
                        <li key={lane.sandbox} className="grid grid-cols-2 gap-3 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
                            <span className="col-span-2 truncate font-mono text-xs sm:col-span-1 sm:self-center">{lane.sandbox}</span>
                            <span><span className="block text-xs text-muted-foreground">Queued</span><span className="tabular-nums">{formatNumber(lane.queued)}</span></span>
                            <span><span className="block text-xs text-muted-foreground">Running</span><span className="tabular-nums">{formatNumber(lane.running)}</span></span>
                            <span>
                                <span className="block text-xs text-muted-foreground">Oldest wait</span>
                                <span className={cn("tabular-nums", slow && "font-medium text-warning")}>{lane.queued ? formatDuration(lane.oldest_wait_sec) : "—"}{slow ? " · slow" : ""}</span>
                            </span>
                            <span><span className="block text-xs text-muted-foreground">Avg run (10 min)</span><span className="tabular-nums">{lane.avg_run_sec ? formatDuration(lane.avg_run_sec) : "—"}</span></span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function RunRow({ run, canCancel, onCancel }) {
    const active = run.status === "queued" || run.status === "running";
    return (
        <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 hover:bg-muted/60 sm:grid-cols-[7rem_minmax(0,2fr)_minmax(0,1fr)_auto]">
            <span className="hidden sm:block"><StatusDot status={run.status} /></span>
            <Link href={`/admin/runs/${encodeURIComponent(run.id)}`} className="min-w-0 focus-visible:underline focus-visible:outline-none">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{run.challenge_title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{run.language} · {run.run_type === "submit" ? "submit" : "run"}</span>
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                    <span className="font-mono text-xs">…{run.id.slice(-8)}</span> · {run.username}
                    {run.tests_total > 0 && <> · {run.tests_passed} / {run.tests_total} tests</>}
                </span>
                <span className="block sm:hidden"><StatusDot status={run.status} /></span>
            </Link>
            <span className="hidden text-sm text-muted-foreground sm:block">
                <span className="block">waited {formatDuration(run.waited_sec)}</span>
                <span className="block">{run.ran_sec != null ? `ran ${formatDuration(run.ran_sec)}` : "not started"}</span>
            </span>
            <span className="flex items-center justify-end gap-3">
                <span className="text-sm text-muted-foreground">{formatRelative(run.queued_at)}</span>
                {active && canCancel && <RowAction icon={LuX} label="Cancel" target={`run ${run.id}`} tone="danger" onClick={() => onCancel(run)} />}
            </span>
        </li>
    );
}

/** The runs screen's finding: runs stuck past the deadline first, then the week's failure share. */
function runFinding(expired, counts) {
    if (expired) return <Finding tone="attention">{`${plural(expired, "run")} past the deadline; the hourly sweeper closes them, or close them now.`}</Finding>;
    if (!counts?.all) return "No code run in the last 7 days.";
    const bad = (counts.failed || 0) + (counts.timeout || 0);
    if (!bad) return <Finding tone="good">{`${plural(counts.all, "run")} in the last 7 days, none failed.`}</Finding>;
    return <Finding tone={bad / counts.all > 0.1 ? "attention" : undefined}>{`${formatNumber(bad)} of ${plural(counts.all, "run")} in the last 7 days failed or timed out.`}</Finding>;
}

export default function RunList() {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const [{ tab, language, type }, update] = useUrlFilters({ tab: TABS.map((item) => item.key), language: LANGUAGES, type: ["manual", "submit"] }, { tab: "active" });
    const [cancelling, setCancelling] = useState(null);
    const [expiring, setExpiring] = useState(false);
    const cancelRun = useAdminCancelRun();
    const expireRuns = useAdminExpireRuns();

    const filters = { tab, language, type };
    const query = useInfiniteQuery({
        queryKey: adminKeys.runList(filters),
        queryFn: ({ pageParam }) => adminClient.listRuns({ ...filters, cursor: pageParam }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextCursor,
        ...QUERY_TIMES.live,
        // The active tab is the one watched while something is wrong: refresh it, only while visible.
        refetchInterval: tab === "active" ? 15_000 : false,
        refetchIntervalInBackground: false,
        retry: retryTransient,
    });

    const pages = query.data?.pages || [];
    const runs = pages.flatMap((page) => page.items);
    const first = pages[0];
    const expired = (first?.queue || []).reduce((sum, lane) => sum + lane.expired, 0);
    const fail = (error) => showAlert(error?.status || 500, error?.message || "The change was not saved");

    return (
        <>
            <PageHeader
                title="Runs"
                description={first ? runFinding(expired, first.counts) : undefined}
                actions={expired > 0 && can("ops.resolve") && <Button variant="outline" size="sm" onClick={() => setExpiring(true)}>Close expired runs</Button>}
            />

            <QueueStrip queue={first?.queue} />

            <TabBar tabs={TABS} value={tab} onChange={(key) => update({ tab: key })} counts={first?.counts} label="Run state" />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Select value={language || "any"} onValueChange={(value) => update({ language: value === "any" ? "" : value })}>
                    <SelectTrigger className="w-40" aria-label="Filter by language"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Any language</SelectItem>
                        {LANGUAGES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={type || "any"} onValueChange={(value) => update({ type: value === "any" ? "" : value })}>
                    <SelectTrigger className="w-36" aria-label="Filter by kind"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Runs and submits</SelectItem>
                        <SelectItem value="manual">Runs</SelectItem>
                        <SelectItem value="submit">Submits</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Runs" aria-busy={query.isPending}>
                {query.isPending ? (
                    <ul className="divide-y divide-border">{Array.from({ length: 5 }, (_, index) => <li key={index} className="px-4 py-3"><Skeleton className="h-10 w-full" /></li>)}</ul>
                ) : query.isError ? (
                    <p className="p-4 text-sm">Couldn&apos;t load runs. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                ) : runs.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{tab === "active" ? "No run is waiting or running." : "No run in this state in the last 7 days."}</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {runs.map((run) => <RunRow key={run.id} run={run} canCancel={can("coderun.cancel")} onCancel={setCancelling} />)}
                    </ul>
                )}
            </section>

            {query.hasNextPage && (
                <div className="mt-4 flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>{query.isFetchingNextPage ? "Loading…" : "Load more"}</Button>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(cancelling)}
                onOpenChange={(open) => !open && setCancelling(null)}
                title="Cancel this run?"
                description={cancelling ? `${cancelling.username}'s ${cancelling.run_type === "submit" ? "submission" : "run"} of ${cancelling.challenge_title} stops. No attempt is used; they can run it again.` : ""}
                confirmLabel="Cancel run"
                reasonLabel="Reason"
                minReason={10}
                onConfirm={(reason) => cancelRun.mutate({ runId: cancelling.id, reason }, { onSuccess: () => showAlert(200, "Run cancelled"), onError: fail })}
            />
            <ConfirmDialog
                open={expiring}
                onOpenChange={setExpiring}
                title={`Close ${formatNumber(expired)} expired run${expired === 1 ? "" : "s"}?`}
                description="Queued runs become cancelled and running ones timed out, as the hourly sweeper would. Learners keep their attempts."
                confirmLabel="Close expired runs"
                reasonLabel="Reason"
                minReason={10}
                onConfirm={(reason) => expireRuns.mutate({ reason }, { onSuccess: (result) => showAlert(200, `${formatNumber(result.closed)} closed`), onError: fail })}
            />
        </>
    );
}
