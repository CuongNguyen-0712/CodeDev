'use client';

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { adminQueries } from "@/queries/premium.query";
import { useAdmin } from "@/components/admin/adminContext";
import PageHeader from "@/components/admin/shell/pageHeader";
import BarChart from "@/components/admin/ui/barChart";
import StatusDot from "@/components/admin/ui/statusDot";
import { formatChange, formatDuration, formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";

import { LuCopy, LuRefreshCw } from "react-icons/lu";

const PUBLISH_ORDER = ["published", "draft", "unpublished", "archived"];

/** The finding line under the title: the one fact that most needs attention. */
function finding(counts, health) {
    if (health?.status === "down") return "The database is not answering.";
    const parts = [];
    if (counts.dead_letters_open) parts.push(`${formatNumber(counts.dead_letters_open)} dead letter${counts.dead_letters_open === 1 ? "" : "s"} open`);
    if (counts.runs_expired) parts.push(`${formatNumber(counts.runs_expired)} code run${counts.runs_expired === 1 ? "" : "s"} stuck past the deadline`);
    if (health?.jobs?.oldestQueuedSec > 60) parts.push(`oldest queued run waited ${formatDuration(health.jobs.oldestQueuedSec)}`);
    return parts.length ? `${parts.join(" · ")}.` : "Nothing needs attention right now.";
}

function Panel({ title, action, className, children }) {
    return (
        <section className={cn("rounded-lg border border-border bg-card", className)} aria-label={title}>
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold">{title}</h2>
                {action}
            </header>
            <div className="p-5">{children}</div>
        </section>
    );
}

function DeploymentCard({ deployment, health }) {
    const services = [
        { key: "database", label: "Database", status: health?.database?.status, detail: health?.database?.status === "healthy" ? "Answering" : "Not answering" },
        { key: "cache", label: "Cache", status: health?.cache?.reachable ? "healthy" : "degraded", detail: health?.cache?.backend || "—" },
        { key: "storage", label: "Storage", status: health?.storage?.status, detail: health?.storage?.provider || "—" },
        {
            key: "jobs", label: "Jobs", status: health?.jobs?.status,
            detail: health?.jobs?.inngest === false ? "Inline (Inngest off)" : `${formatNumber(health?.jobs?.codeRunsActive ?? 0)} active runs`,
        },
    ];
    const copySha = () => deployment.sha && navigator.clipboard?.writeText(deployment.sha).catch(() => {});

    return (
        <section className="grid overflow-hidden rounded-lg border border-border bg-card md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" aria-label="Deployment and health">
            <div className="space-y-2 border-b border-border p-5 md:border-r md:border-b-0">
                <p className="text-sm text-muted-foreground capitalize">{deployment.environment}</p>
                {deployment.message ? (
                    <>
                        <p className="text-base font-semibold leading-snug">{deployment.message}</p>
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            {deployment.branch && <span>{deployment.branch}</span>}
                            {deployment.shortSha && (
                                <button type="button" onClick={copySha} className="inline-flex items-center gap-1 font-mono text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Copy commit ${deployment.shortSha}`}>
                                    {deployment.shortSha}<LuCopy aria-hidden="true" className="size-3" />
                                </button>
                            )}
                        </p>
                    </>
                ) : (
                    <p className="text-base font-semibold">Local build</p>
                )}
            </div>
            <dl className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
                {services.map((service) => (
                    <div key={service.key} className="space-y-1 border-b border-border p-4 sm:border-b-0">
                        <dt className="text-xs text-muted-foreground">{service.label}</dt>
                        <dd><StatusDot status={service.status || "unknown"} /></dd>
                        <dd className="truncate text-xs text-muted-foreground">{service.detail}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

function Kpis({ counts }) {
    const failRate = counts.runs_today ? Math.round((counts.runs_failed_today / counts.runs_today) * 1000) / 10 : null;
    const items = [
        { label: "Active learners (24 h)", value: counts.active_24h, change: formatChange(counts.active_24h, counts.active_prev_24h, "vs previous 24 h") },
        { label: "Submissions today", value: counts.submissions_today, change: formatChange(counts.submissions_today, counts.submissions_yesterday, "vs yesterday") },
        { label: "Code runs today", value: counts.runs_today, change: failRate == null ? null : `${failRate}% failed or timed out`, bad: failRate > 10 },
        { label: "New sign-ups (7 days)", value: counts.signups_7d, change: formatChange(counts.signups_7d, counts.signups_prev_7d, "vs previous 7 days") },
    ];
    return (
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-4" aria-label="Key figures">
            {items.map((item, index) => (
                <div key={item.label} className={cn("space-y-1 p-5", index % 2 === 1 && "border-l border-border", index > 1 && "border-t border-border lg:border-t-0", index === 2 && "lg:border-l")}>
                    <dt className="text-sm text-muted-foreground">{item.label}</dt>
                    <dd className="text-2xl font-semibold tabular-nums">{formatNumber(item.value)}</dd>
                    <dd className={cn("text-xs", item.bad ? "text-destructive" : "text-muted-foreground")}>{item.change || "—"}</dd>
                </div>
            ))}
        </dl>
    );
}

function NeedsAttention({ counts, can }) {
    const rows = [
        { key: "dead", count: counts.dead_letters_open, label: "Dead letters open", href: "/admin/system", permission: "ops.read" },
        { key: "expired", count: counts.runs_expired, label: "Code runs stuck past the deadline", href: "/admin/runs?tab=active", permission: "submission.read" },
        { key: "purge", count: counts.purge_soon, label: "Unverified accounts removed within a day", href: "/admin/users?tab=unverified", permission: "user.read" },
        { key: "draft", count: counts.courses?.draft || 0, label: "Draft courses", href: "/admin/courses", permission: "admin.read" },
    ].filter((row) => row.count > 0);

    if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing is waiting. Queues are empty and no job failed for good.</p>;

    return (
        <ul className="divide-y divide-border">
            {rows.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm">{row.label}</span>
                    <span className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">{formatNumber(row.count)}</span>
                        {can(row.permission) && <Link href={row.href} className="text-sm text-primary-ink hover:underline">Review</Link>}
                    </span>
                </li>
            ))}
        </ul>
    );
}

const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function OverviewSkeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="Loading overview">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <div className="grid gap-4 lg:grid-cols-3">
                <Skeleton className="h-64 rounded-lg lg:col-span-2" />
                <Skeleton className="h-64 rounded-lg" />
            </div>
        </div>
    );
}

export default function AdminOverview() {
    const { can } = useAdmin();
    const { data, isPending, isError, refetch, isFetching, dataUpdatedAt } = useQuery(adminQueries.dashboard());

    const updated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
    const actions = (
        <>
            {updated && <span className="text-xs text-muted-foreground">Updated {updated}</span>}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh overview">
                <LuRefreshCw aria-hidden="true" className={cn(isFetching && "animate-spin motion-reduce:animate-none")} />
                Refresh
            </Button>
        </>
    );

    if (isPending) return <><PageHeader title="Overview" actions={actions} /><OverviewSkeleton /></>;
    if (isError || !data) {
        return (
            <>
                <PageHeader title="Overview" actions={actions} />
                <p className="rounded-lg border border-border p-4 text-sm">
                    Couldn&apos;t load the overview.{" "}
                    <button type="button" onClick={() => refetch()} className="font-medium text-primary-ink hover:underline">Retry</button>
                </p>
            </>
        );
    }

    const { counts, series, audit, health, deployment } = data;
    const staff = counts.staff || {};

    return (
        <>
            <PageHeader title="Overview" description={finding(counts, health)} actions={actions}>
                <StatusDot status={health?.status || "unknown"} />
            </PageHeader>

            <div className="space-y-4">
                <DeploymentCard deployment={deployment} health={health} />
                <Kpis counts={counts} />

                <div className="grid gap-4 lg:grid-cols-3">
                    <Panel title="Submissions, last 14 days" className="lg:col-span-2" action={<span className="text-xs text-muted-foreground">Code and quiz</span>}>
                        <BarChart data={series.map((point) => ({ label: point.day, value: point.count }))} label="Submissions per day, last 14 days" formatLabel={dayLabel} />
                    </Panel>
                    <Panel title="Needs attention">
                        <NeedsAttention counts={counts} can={can} />
                    </Panel>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title="Catalog and people" action={can("admin.read") && <Link href="/admin/courses" className="text-sm text-primary-ink hover:underline">Courses</Link>}>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            {PUBLISH_ORDER.map((status) => (
                                <div key={status} className="flex items-center justify-between gap-3">
                                    <dt><StatusDot status={status} /></dt>
                                    <dd className="tabular-nums">{formatNumber(counts.courses?.[status] || 0)}</dd>
                                </div>
                            ))}
                            <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Open challenges</dt><dd className="tabular-nums">{formatNumber(counts.challenges_open)}</dd></div>
                            <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Premium courses</dt><dd className="tabular-nums">{formatNumber(counts.courses_premium)}</dd></div>
                            <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Users</dt><dd className="tabular-nums">{formatNumber(counts.users_total)}</dd></div>
                            <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Unverified</dt><dd className="tabular-nums">{formatNumber(counts.unverified)}</dd></div>
                            <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Admins</dt><dd className="tabular-nums">{formatNumber((staff.super_admin || 0) + (staff.admin || 0))}</dd></div>
                            <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Course managers</dt><dd className="tabular-nums">{formatNumber(staff.course_manager || 0)}</dd></div>
                        </dl>
                    </Panel>
                    <Panel title="Recent admin activity" action={can("audit.read") && <Link href="/admin/audit" className="text-sm text-primary-ink hover:underline">View all</Link>}>
                        {audit.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No admin changes yet.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {audit.map((entry) => (
                                    <li key={entry.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0 text-sm">
                                        <span className="min-w-0 truncate"><span className="font-mono text-xs">{entry.action}</span> <span className="text-muted-foreground">by {entry.actor || "system"}</span></span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(entry.created_at)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>
        </>
    );
}
