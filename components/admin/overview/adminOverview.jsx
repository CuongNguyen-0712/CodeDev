'use client';

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminQueries } from "@/queries/premium.query";
import { LOW_RATING } from "@/lib/ratingRules";
import { useAdmin } from "@/components/admin/adminContext";
import PageHeader from "@/components/admin/shell/pageHeader";
import BarChart from "@/components/admin/ui/barChart";
import HBar from "@/components/admin/ui/hBar";
import TabBar from "@/components/admin/ui/tabBar";
import { useUrlFilters } from "@/components/admin/ui/useUrlFilters";
import Finding from "@/components/admin/ui/finding";
import StatusDot from "@/components/admin/ui/statusDot";
import { formatChange, formatDuration, formatNumber, formatRelative } from "@/components/admin/ui/format";
import { StripSkeleton, TableSkeleton } from "@/components/admin/ui/adminSkeleton";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { cn } from "@/lib/utils";

import { LuArrowRight, LuCopy, LuRefreshCw } from "react-icons/lu";

const PUBLISH_ORDER = ["published", "draft", "unpublished", "archived"];

/** The finding line under the title: the one fact that most needs attention. */
function finding(counts, health) {
    if (health?.status === "down") return <Finding tone="critical">The database is not answering.</Finding>;
    const parts = [];
    if (counts.dead_letters_open) parts.push(`${formatNumber(counts.dead_letters_open)} dead letter${counts.dead_letters_open === 1 ? "" : "s"} open`);
    if (counts.runs_expired) parts.push(`${formatNumber(counts.runs_expired)} code run${counts.runs_expired === 1 ? "" : "s"} stuck past the deadline`);
    if (health?.jobs?.oldestQueuedSec > 60) parts.push(`oldest queued run waited ${formatDuration(health.jobs.oldestQueuedSec)}`);
    return parts.length ? <Finding tone="attention">{`${parts.join(" · ")}.`}</Finding> : <Finding tone="good">Nothing needs attention right now.</Finding>;
}

function Panel({ title, badge, action, footer, className, children }) {
    return (
        <section className={cn("flex flex-col rounded-lg border border-border bg-card", className)} aria-label={title}>
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2>{badge}</div>
                {action}
            </header>
            <div className="flex-1 p-4">{children}</div>
            {/* Pinned to the bottom, so a short list stretched to its neighbour ends on an action, not a gap. */}
            {footer && <div className="border-t border-border px-4 py-2.5 text-sm">{footer}</div>}
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
        <section className="grid overflow-hidden rounded-lg border border-border bg-card @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" aria-label="Deployment and health">
            <div className="space-y-1 border-b border-border px-4 py-3 @3xl:border-r @3xl:border-b-0">
                <p className="text-sm text-muted-foreground capitalize">{deployment.environment}</p>
                {deployment.message ? (
                    <>
                        <p className="text-base font-semibold leading-snug break-words">{deployment.message}</p>
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
            <dl className="grid grid-cols-2 divide-border @xl:grid-cols-4 @xl:divide-x">
                {services.map((service) => (
                    <div key={service.key} className="space-y-0.5 border-b border-border px-4 py-3 nth-[n+3]:border-b-0 @xl:border-b-0">
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
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card @3xl:grid-cols-4" aria-label="Key figures">
            {items.map((item, index) => (
                <div key={item.label} className={cn("space-y-0.5 px-4 py-3.5",index % 2 === 1 && "border-l border-border", index > 1 && "border-t border-border @3xl:border-t-0", index === 2 && "@3xl:border-l")}>
                    <dt className="text-sm text-muted-foreground">{item.label}</dt>
                    <dd className="text-2xl font-semibold tabular-nums">{formatNumber(item.value)}</dd>
                    <dd className={cn("text-xs", item.bad ? "text-destructive" : "text-muted-foreground")}>{item.change || "—"}</dd>
                </div>
            ))}
        </dl>
    );
}

/** How many kinds of work wait in Needs attention: a warning chip, or a calm one when nothing waits. */
function AttentionBadge({ counts }) {
    const waiting = [counts.dead_letters_open, counts.runs_expired, counts.purge_soon, counts.courses?.draft, counts.courses_low_rated, counts.feedback_open].filter((count) => count > 0).length;
    return waiting ? <Badge variant="warning">{waiting} to review</Badge> : <Badge variant="success">Clear</Badge>;
}

function NeedsAttention({ counts, can }) {
    const rows = [
        { key: "dead", count: counts.dead_letters_open, label: "Dead letters open", href: "/admin/system", permission: "ops.read" },
        { key: "expired", count: counts.runs_expired, label: "Code runs stuck past the deadline", href: "/admin/runs?tab=active", permission: "submission.read" },
        { key: "purge", count: counts.purge_soon, label: "Unverified accounts removed within a day", href: "/admin/users?tab=unverified", permission: "user.read" },
        { key: "draft", count: counts.courses?.draft || 0, label: "Draft courses", href: "/admin/courses", permission: "admin.read" },
        { key: "rating", count: counts.courses_low_rated || 0, label: `Courses rated below ${LOW_RATING.below} (${LOW_RATING.minRatings}+ ratings)`, href: "/admin/courses", permission: "comment.moderate" },
        { key: "feedback", count: counts.feedback_open || 0, label: "Feedback waiting for a reply", href: "/admin/feedback", permission: "feedback.read" },
    ].filter((row) => row.count > 0);

    if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing is waiting. Queues are empty and no job failed for good.</p>;

    return (
        <ul className="divide-y divide-border">
            {rows.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
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

const RANGES = ["14", "30", "90"];
// One series per metric; code runs stack their outcomes, each in its status hue with a word in the legend.
const METRICS = [
    { key: "submissions", label: "Submissions", note: "Code and quiz answers", value: (row) => row.submissions },
    { key: "learners", label: "Practising learners", note: "Learners who submitted or ran code that day, staff left out", value: (row) => row.learners },
    { key: "signups", label: "Sign-ups", note: "New accounts", value: (row) => row.signups },
    {
        key: "runs", label: "Code runs", note: "Runs and submits by how they ended",
        value: (row) => row.runs_completed + row.runs_failed + row.runs_timeout,
        series: [
            { key: "runs_completed", label: "Completed", className: "fill-primary-ink" },
            { key: "runs_failed", label: "Failed", className: "fill-destructive" },
            { key: "runs_timeout", label: "Timed out or cancelled", className: "fill-warning" },
        ],
    },
];

/** Activity per UTC day: a metric, a 14/30/90-day window, and the window before it as dashed outlines. */
function ActivityPanel() {
    const [{ range, metric }, update] = useUrlFilters({ range: RANGES, metric: METRICS.map((item) => item.key) }, { range: "14", metric: "submissions" });
    const days = Number(range);
    const query = useQuery(adminQueries.activity(days));
    const chosen = METRICS.find((item) => item.key === metric) || METRICS[0];
    const current = query.data?.current || [];
    const previous = query.data?.previous || [];
    const totals = Object.fromEntries(METRICS.map((item) => [item.key, current.reduce((sum, row) => sum + item.value(row), 0)]));
    const previousTotal = previous.reduce((sum, row) => sum + chosen.value(row), 0);
    const data = current.map((row) => ({
        label: row.day,
        value: chosen.value(row),
        parts: chosen.series ? Object.fromEntries(chosen.series.map((part) => [part.key, row[part.key]])) : undefined,
    }));

    return (
        <Panel
            title="Activity"
            className="min-w-0 @4xl:col-span-2"
            action={
                <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(value) => value && update({ range: value })} aria-label="Days shown">
                    {RANGES.map((value) => <ToggleGroupItem key={value} value={value} className="px-2.5 text-xs">{value} days</ToggleGroupItem>)}
                </ToggleGroup>
            }
        >
            <TabBar tabs={METRICS} value={chosen.key} onChange={(key) => update({ metric: key })} counts={query.data ? totals : undefined} label="Metric" />
            {query.isPending ? (
                <Skeleton className="h-44 w-full" />
            ) : query.isError ? (
                <p className="text-sm">Couldn&apos;t load the activity. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
            ) : (
                <>
                    <p className="mb-2 text-xs text-muted-foreground">
                        {chosen.note} · {formatChange(totals[chosen.key], previousTotal, `vs the ${days} days before`) || "—"} · days in UTC
                    </p>
                    <BarChart
                        data={data}
                        compare={previous.map((row) => chosen.value(row))}
                        compareLabel={`the ${days} days before`}
                        series={chosen.series}
                        label={`${chosen.label} per day, last ${days} days`}
                        unit="days"
                        height={170}
                        formatLabel={dayLabel}
                    />
                </>
            )}
        </Panel>
    );
}

/** The courses most registered in the last 30 days, each with how many of those registrations finished. */
function TopCourses({ courses, can }) {
    if (!courses?.length) return <p className="text-sm text-muted-foreground">No course had a new registration in the last 30 days.</p>;
    return (
        <HBar
            label="Courses with the most new registrations, last 30 days"
            rows={courses.map((course) => ({
                key: course.id,
                label: can("admin.read")
                    ? <Link href={`/admin/courses/${encodeURIComponent(course.id)}`} className="hover:underline">{course.title}</Link>
                    : course.title,
                value: course.registrations,
                detail: `${formatNumber(course.completed)} finished`,
            }))}
        />
    );
}

function OverviewSkeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="Loading overview">
            <StripSkeleton />
            <StripSkeleton />
            <div className="grid gap-4 @4xl:grid-cols-3">
                <Skeleton className="h-60 rounded-lg border border-border @4xl:col-span-2" />
                <TableSkeleton rows={3} columns={2} label="Loading what needs attention" />
            </div>
        </div>
    );
}

export default function AdminOverview() {
    const { can } = useAdmin();
    const queryClient = useQueryClient();
    const { data, isPending, isError, refetch, isFetching } = useQuery(adminQueries.dashboard());
    // Refresh recounts on the server; the automatic refetch may serve figures cached up to 60 s.
    const recount = () => queryClient.fetchQuery({ ...adminQueries.dashboard(), queryFn: () => adminClient.getDashboard({ fresh: true }), staleTime: 0 });

    // When the figures were counted (they are cached on the server), not when the browser fetched them.
    const updated = data?.measuredAt ? new Date(data.measuredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
    const actions = (
        <>
            {updated && <span className="text-xs text-muted-foreground">Updated {updated}</span>}
            <Button variant="outline" size="sm" onClick={recount} disabled={isFetching} aria-label="Refresh overview">
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

    const { counts, topCourses, audit, health, deployment } = data;
    const staff = counts.staff || {};

    return (
        <>
            <PageHeader title="Overview" description={finding(counts, health)} actions={actions}>
                <StatusDot status={health?.status || "unknown"} />
            </PageHeader>

            <div className="space-y-4">
                <DeploymentCard deployment={deployment} health={health} />
                <Kpis counts={counts} />

                <div className="grid gap-4 @4xl:grid-cols-3">
                    <ActivityPanel />
                    <Panel
                        title="Needs attention"
                        badge={<AttentionBadge counts={counts} />}
                        footer={can("ops.read") && (
                            <Link href="/admin/system" className="inline-flex items-center gap-1 font-medium text-primary-ink hover:underline">
                                Open System<LuArrowRight aria-hidden="true" className="size-3.5" />
                            </Link>
                        )}
                    >
                        <NeedsAttention counts={counts} can={can} />
                    </Panel>
                </div>

                <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
                    <Panel title="Top courses, last 30 days" action={<span className="text-xs text-muted-foreground">New registrations</span>}>
                        <TopCourses courses={topCourses} can={can} />
                    </Panel>
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
                            <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Admins</dt><dd className="tabular-nums">{formatNumber(staff.admins || 0)}</dd></div>
                            <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Course managers</dt><dd className="tabular-nums">{formatNumber(staff.course_manager || 0)}</dd></div>
                        </dl>
                    </Panel>
                    {can("audit.read") && (
                        <Panel title="Recent admin activity" action={<Link href="/admin/audit" className="text-sm text-primary-ink hover:underline">View all</Link>}>
                            {audit.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No admin changes yet.</p>
                            ) : (
                                <ul className="divide-y divide-border">
                                    {audit.map((entry) => (
                                        <li key={entry.id} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0 text-sm">
                                            <span className="min-w-0 truncate"><span className="font-mono text-xs">{entry.action}</span> <span className="text-muted-foreground">by {entry.actor || "system"}</span></span>
                                            <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(entry.created_at)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                    )}
                </div>
            </div>
        </>
    );
}
