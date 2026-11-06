'use client';

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { QueueStrip } from "@/components/admin/runs/runList";
import PageHeader from "@/components/admin/shell/pageHeader";
import Finding from "@/components/admin/ui/finding";
import StatusDot from "@/components/admin/ui/statusDot";
import { formatNumber, formatRelative, formatTime } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import RowAction from "@/components/admin/ui/rowAction";
import { cn } from "@/lib/utils";

import { LuCheck, LuExternalLink, LuRefreshCw, LuRotateCw } from "react-icons/lu";

const bytes = (value) => {
    if (!value) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};

function Panel({ title, badge, action, children }) {
    return (
        <section className="rounded-lg border border-border bg-card" aria-label={title}>
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div className="flex min-w-0 items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2>{badge}</div>
                {action}
            </header>
            <div className="p-5">{children}</div>
        </section>
    );
}

function GrafanaLink({ url, path, label = "Open in Grafana" }) {
    if (!url) return null;
    return (
        <a href={`${url.replace(/\/$/, "")}${path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary-ink hover:underline">
            {label}<LuExternalLink aria-hidden="true" className="size-3.5" /><span className="sr-only">(opens in a new tab)</span>
        </a>
    );
}

function Services({ health }) {
    const items = [
        { label: "Database", status: health.database?.status, detail: health.database?.status === "healthy" ? "Answering" : "Not answering" },
        { label: "Cache", status: health.cache?.reachable ? "healthy" : "degraded", detail: `${health.cache?.backend || "—"}${health.cache?.degradedSince ? ` · degraded ${formatRelative(health.cache.degradedSince)}` : ""}` },
        { label: "Storage", status: health.storage?.status, detail: health.storage?.provider || "—" },
        { label: "Jobs", status: health.jobs?.status, detail: health.jobs?.inngest === false ? "Inline (Inngest off)" : `${formatNumber(health.jobs?.deadLettersLastHour ?? 0)} dead letters in the last hour` },
    ];
    return (
        <dl className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card @3xl:grid-cols-4">
            {items.map((item, index) => (
                <div key={item.label} className={cn("space-y-1 p-4", index % 2 === 1 && "border-l border-border", index > 1 && "border-t border-border @3xl:border-t-0", index === 2 && "@3xl:border-l")}>
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd><StatusDot status={item.status || "unknown"} /></dd>
                    <dd className="truncate text-xs text-muted-foreground">{item.detail}</dd>
                </div>
            ))}
        </dl>
    );
}

export default function SystemPage() {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const queryClient = useQueryClient();
    const [acting, setActing] = useState(null);
    const query = useQuery({
        queryKey: [...adminKeys.all, "system"],
        queryFn: () => adminClient.getSystem(),
        ...QUERY_TIMES.live,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        retry: retryTransient,
    });
    const act = useMutation({
        mutationFn: ({ kind, id, reason }) => (kind === "retry" ? adminClient.retryDeadLetter({ id, reason }) : adminClient.resolveDeadLetter({ id, reason })),
        onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
    });

    const updated = query.dataUpdatedAt ? formatTime(query.dataUpdatedAt) : null;
    const data = query.data;
    const actions = (
        <>
            {updated && <span className="text-xs text-muted-foreground">Updated {updated}</span>}
            <GrafanaLink url={data?.grafanaUrl} path="/dashboards" label="Grafana" />
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh system status">
                <LuRefreshCw aria-hidden="true" className={cn(query.isFetching && "animate-spin motion-reduce:animate-none")} />Refresh
            </Button>
        </>
    );

    if (query.isPending) return <><PageHeader title="System" actions={actions} /><div className="space-y-4"><Skeleton className="h-24 w-full rounded-lg" /><Skeleton className="h-40 w-full rounded-lg" /></div></>;
    if (query.isError || !data) {
        return <><PageHeader title="System" actions={actions} /><p className="rounded-lg border border-border p-4 text-sm">Couldn&apos;t load the system status. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p></>;
    }

    const { health, queue, outbox, deadLetters, database, grafanaUrl } = data;
    const openDeadLetters = data.deadLettersOpen ?? deadLetters.length;
    const degraded = [["Database", health.database?.status], ["Cache", health.cache?.reachable ? "healthy" : "degraded"], ["Storage", health.storage?.status], ["Jobs", health.jobs?.status]]
        .filter(([, status]) => status && status !== "healthy").map(([name]) => name);
    const finding = degraded.length ? <Finding tone="critical">{`${degraded.join(", ")} ${degraded.length === 1 ? "is" : "are"} not healthy.`}</Finding>
        : openDeadLetters ? <Finding tone="attention">{`${formatNumber(openDeadLetters)} dead letter${openDeadLetters === 1 ? "" : "s"} open.`}</Finding>
        : <Finding tone="good">Every service answers and no job failed for good.</Finding>;

    return (
        <>
            <PageHeader title="System" description={finding} actions={actions}><StatusDot status={health.status} /></PageHeader>
            <Services health={health} />
            <h2 className="mb-2 text-sm font-semibold">Code-run queue</h2>
            <QueueStrip queue={queue} />

            <div className="space-y-4">
                <Panel title="Dead letters" badge={openDeadLetters > 0 && <Badge variant="destructive">{formatNumber(openDeadLetters)} open</Badge>} action={<GrafanaLink url={grafanaUrl} path="/d/codedev-jobs" />}>
                    {deadLetters.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No open dead letter. Background work that fails for good lands here.</p>
                    ) : (
                        <div className="-mx-5 -my-5 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-muted-foreground">
                                        <th scope="col" className="px-5 py-2 font-normal">Kind</th>
                                        <th scope="col" className="px-5 py-2 font-normal @max-2xl:hidden">Error</th>
                                        <th scope="col" className="px-5 py-2 text-right font-normal @max-2xl:hidden">Attempts</th>
                                        <th scope="col" className="px-5 py-2 text-right font-normal">Age</th>
                                        {can("ops.resolve") && <th scope="col" className="px-5 py-2"><span className="sr-only">Actions</span></th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {deadLetters.map((letter) => (
                                        <tr key={letter.id}>
                                            <td className="px-5 py-2.5 break-all @xl:break-normal @xl:whitespace-nowrap"><span className="font-mono text-xs">{letter.kind}</span><span className="block text-xs text-muted-foreground">{letter.source}</span></td>
                                            <td className="max-w-0 truncate px-5 py-2.5 text-muted-foreground @max-2xl:hidden" title={letter.error || ""}>{letter.error || "—"}</td>
                                            <td className="px-5 py-2.5 text-right tabular-nums @max-2xl:hidden">{letter.attempts ?? "—"}</td>
                                            <td className="px-5 py-2.5 text-right whitespace-nowrap text-muted-foreground">{formatRelative(letter.created_at)}</td>
                                            {can("ops.resolve") && (
                                                <td className="px-5 py-2.5 text-right whitespace-nowrap">
                                                    {!String(letter.kind).includes("code-run") && <RowAction icon={LuRotateCw} label="Retry" target={letter.kind} tone="primary" onClick={() => setActing({ kind: "retry", letter })} />}
                                                    <RowAction icon={LuCheck} label="Resolve" target={letter.kind} onClick={() => setActing({ kind: "resolve", letter })} />
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>

                <div className="grid gap-4 @3xl:grid-cols-2">
                    <Panel title="Auth outbox">
                        <dl className="grid grid-cols-3 gap-4 text-sm">
                            <div><dt className="text-xs text-muted-foreground">Pending</dt><dd className="text-xl font-semibold tabular-nums">{formatNumber(outbox.pending)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Retrying</dt><dd className="text-xl font-semibold tabular-nums">{formatNumber(outbox.retrying)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Dead</dt><dd className={cn("text-xl font-semibold tabular-nums", outbox.dead > 0 && "text-destructive")}>{formatNumber(outbox.dead)}</dd></div>
                        </dl>
                        <p className="mt-3 text-xs text-muted-foreground">{outbox.oldest_pending_at ? `Oldest pending ${formatRelative(outbox.oldest_pending_at)}.` : "Nothing waiting to be sent."}</p>
                    </Panel>
                    <Panel title="Database connections" action={<GrafanaLink url={grafanaUrl} path="/d/codedev-database" />}>
                        <ul className="space-y-1.5 text-sm">
                            {database.connections.map((row) => (
                                <li key={row.state} className="flex justify-between gap-3"><span className="capitalize text-muted-foreground">{row.state}</span><span className="tabular-nums">{formatNumber(row.count)}</span></li>
                            ))}
                        </ul>
                    </Panel>
                </div>

                <div className="grid gap-4 @3xl:grid-cols-2">
                    <Panel title="Largest tables">
                        <ul className="divide-y divide-border text-sm">
                            {database.tables.map((table) => (
                                <li key={table.name} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                                    <span className="min-w-0 truncate font-mono text-xs">{table.name}</span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(table.rows)} rows · {bytes(table.bytes)}</span>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                    <Panel title="Most expensive statements">
                        {!database.statements ? (
                            <p className="text-sm text-muted-foreground">pg_stat_statements is not installed on this database.</p>
                        ) : (
                            <ul className="divide-y divide-border text-sm">
                                {database.statements.map((statement, index) => (
                                    <li key={index} className="space-y-0.5 py-2 first:pt-0 last:pb-0">
                                        <code className="block truncate font-mono text-xs" title={statement.query}>{statement.query}</code>
                                        <span className="block text-xs text-muted-foreground tabular-nums">{formatNumber(statement.calls)} calls · {statement.mean_ms} ms mean · {formatNumber(statement.total_ms)} ms total</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>

            <ConfirmDialog
                open={Boolean(acting)}
                onOpenChange={(open) => !open && setActing(null)}
                title={acting?.kind === "retry" ? `Retry ${acting?.letter.kind}?` : `Resolve ${acting?.letter.kind}?`}
                description={acting?.kind === "retry"
                    ? (acting?.letter.source === "outbox" ? "The outbox row becomes pending and is sent again." : "The original event is sent to Inngest again with a new id.")
                    : "Marks it handled. Nothing is sent again."}
                confirmLabel={acting?.kind === "retry" ? "Retry" : "Resolve"}
                destructive={false}
                reasonLabel="Reason"
                minReason={10}
                onConfirm={(reason) => act.mutate({ kind: acting.kind, id: acting.letter.id, reason }, {
                    onSuccess: () => showAlert(200, acting.kind === "retry" ? "Sent again" : "Resolved"),
                    onError: (error) => showAlert(error?.status || 500, error?.message || "The change was not saved"),
                })}
            />
        </>
    );
}
