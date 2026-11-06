'use client';

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useAdminCancelRun } from "@/mutations/premium.mutation";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import PageHeader from "@/components/admin/shell/pageHeader";
import Finding from "@/components/admin/ui/finding";
import StatusDot from "@/components/admin/ui/statusDot";
import TabBar from "@/components/admin/ui/tabBar";
import { formatDateTime, formatDuration, formatNumber } from "@/components/admin/ui/format";
import { TableSkeleton } from "@/components/admin/ui/adminSkeleton";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

const TABS = [
    { key: "tests", label: "Tests" },
    { key: "source", label: "Source and output" },
    { key: "timeline", label: "Timeline" },
];

const seconds = (from, to) => (from && to ? (new Date(to) - new Date(from)) / 1000 : null);

function Fact({ label, children }) {
    return (
        <div className="min-w-0 space-y-1 p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate text-sm">{children}</dd>
        </div>
    );
}

/** The run's finding: its error first, then how many graded tests passed, then what was run. */
function runFinding(run, passed) {
    const what = `${run.challenge_title} · ${run.language} · ${run.run_type === "submit" ? "submission" : "run"}`;
    const problem = run.error || run.rejected?.message;
    if (problem) return <Finding tone="critical">{problem}</Finding>;
    if (!run.tests.length) return what;
    const all = passed === run.tests.length;
    return <Finding tone={all ? "good" : "attention"}>{`${passed} of ${run.tests.length} tests passed · ${what}`}</Finding>;
}

function Tests({ tests }) {
    if (tests.length === 0) return <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No graded test on this run.</p>;
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                        <th scope="col" className="px-4 py-2 font-normal">Test</th>
                        <th scope="col" className="px-4 py-2 font-normal">Result</th>
                        <th scope="col" className="px-4 py-2 text-right font-normal">Time</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {tests.map((test, index) => (
                        <tr key={test.id ?? index}>
                            <td className="px-4 py-2.5">{test.name || `Test ${index + 1}`}{test.hidden && <span className="ml-2 text-xs text-muted-foreground">hidden</span>}</td>
                            <td className="px-4 py-2.5"><StatusDot status={test.status === "passed" ? "completed" : "failed"} label={test.status === "passed" ? "Passed" : "Failed"} /></td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{test.timeMs != null ? `${formatNumber(test.timeMs)} ms` : "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Source({ runId, hasSource }) {
    const [show, setShow] = useState(false);
    const query = useQuery({
        // Every read of the source writes a submission.view audit row: fetch it once per opening, and keep
        // the key outside adminKeys.all so admin writes (which invalidate that prefix) don't read it again.
        queryKey: ["admin-run-source", runId],
        queryFn: () => adminClient.getRunSource(runId),
        enabled: show,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
    });

    if (!show) {
        return (
            <div className="space-y-3 rounded-lg border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                    {hasSource ? "The learner's code and the test outputs. Opening them is written to the audit log." : "The code of this run was removed by retention."}
                </p>
                {hasSource && <Button variant="outline" size="sm" onClick={() => setShow(true)}>Show source (audited)</Button>}
            </div>
        );
    }
    if (query.isPending) return <TableSkeleton rows={3} columns={3} label="Loading tests" />;
    if (query.isError) return <p className="rounded-lg border border-border p-4 text-sm">Couldn&apos;t load the source. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>;

    // Keep each test's number from the Tests list ("Test 3" stays "Test 3" here).
    const failed = query.data.tests.map((test, index) => ({ ...test, number: index + 1 })).filter((test) => test.status !== "passed");
    return (
        <div className="space-y-4">
            <pre className="max-h-[28rem] overflow-auto rounded-lg bg-editor p-4 font-mono text-sm text-editor-foreground"><code>{query.data.code ?? "Removed by retention."}</code></pre>
            {failed.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Failed tests</h3>
                    {failed.map((test, index) => (
                        <div key={test.id ?? index} className="overflow-hidden rounded-lg border border-border">
                            <p className="border-b border-border px-4 py-2 text-sm">{test.name || `Test ${test.number}`}</p>
                            <dl className="grid gap-px bg-border text-sm @xl:grid-cols-2">
                                <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Expected</dt><dd><pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{String(test.expected ?? "—")}</pre></dd></div>
                                <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Actual</dt><dd><pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{String(test.actual ?? test.error ?? "—")}</pre></dd></div>
                            </dl>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Timeline({ run }) {
    const steps = [
        { label: "Queued", at: run.queued_at },
        { label: "Event sent", at: run.published_at },
        { label: "Started", at: run.started_at },
        { label: run.status === "completed" ? "Completed" : run.finished_at ? `Ended (${run.status})` : "Not finished", at: run.finished_at },
    ];
    return (
        <ol className="overflow-hidden rounded-lg border border-border bg-card">
            {steps.map((step) => (
                <li key={step.label} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0">
                    <span>{step.label}</span>
                    <span className="text-muted-foreground tabular-nums">{step.at ? formatDateTime(step.at) : "—"}</span>
                </li>
            ))}
            <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>Deadline</span>
                <span className="text-muted-foreground tabular-nums">{formatDateTime(run.deadline_at)}</span>
            </li>
        </ol>
    );
}

export default function RunDetail({ runId }) {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const [tab, setTab] = useState("tests");
    const [cancelling, setCancelling] = useState(false);
    const cancelRun = useAdminCancelRun();
    const { data: run, isPending, isError, refetch } = useQuery({
        queryKey: adminKeys.run(runId),
        queryFn: () => adminClient.getRun(runId),
        ...QUERY_TIMES.live,
        refetchInterval: (query) => (["queued", "running"].includes(query.state.data?.status) ? 5_000 : false),
        refetchIntervalInBackground: false,
        retry: retryTransient,
    });

    if (isPending) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-10 w-72" /><Skeleton className="h-24 w-full rounded-lg" /><Skeleton className="h-48 w-full rounded-lg" /></div>;
    if (isError || !run) {
        return (
            <>
                <PageHeader title="Run" />
                <p className="rounded-lg border border-border p-4 text-sm">Couldn&apos;t load this run. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => refetch()}>Retry</button></p>
            </>
        );
    }

    const active = run.status === "queued" || run.status === "running";
    const passed = run.tests.filter((test) => test.status === "passed").length;

    return (
        <>
            <PageHeader
                title={`Run …${run.id.slice(-8)}`}
                description={runFinding(run, passed)}
                actions={active && can("coderun.cancel") && <Button variant="outline" onClick={() => setCancelling(true)}>Cancel run</Button>}
            >
                <StatusDot status={run.status} />
            </PageHeader>

            <dl className="mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card @xl:grid-cols-4 [&>div]:border-border [&>div:nth-child(even)]:border-l [&>div:nth-child(n+3)]:border-t @xl:[&>div:nth-child(n+3)]:border-t-0 @xl:[&>div:nth-child(n+5)]:border-t @xl:[&>div:not(:nth-child(4n+1))]:border-l">
                <Fact label="Learner">{can("user.read")
                    ? <Link href={`/admin/users/${encodeURIComponent(run.user_id)}`} className="text-primary-ink hover:underline">{run.username}</Link>
                    : run.username}</Fact>
                <Fact label="Challenge">{run.challenge_title}</Fact>
                <Fact label="Tests"><span className="text-lg font-semibold tabular-nums">{passed} / {run.tests.length}</span> <span className="text-muted-foreground">passed</span></Fact>
                <Fact label="Sandbox"><span className="font-mono text-xs">{run.sandbox || "default"}</span></Fact>
                <Fact label="Waited">{formatDuration(seconds(run.queued_at, run.started_at || run.finished_at))}</Fact>
                <Fact label="Ran">{formatDuration(seconds(run.started_at, run.finished_at))}</Fact>
                <Fact label="Course">{run.course_title || "—"}</Fact>
                <Fact label="Kind">{run.run_type === "submit" ? "Submission" : "Run"}</Fact>
            </dl>

            <TabBar tabs={TABS} value={tab} onChange={setTab} label="Run sections" />
            {tab === "tests" && <Tests tests={run.tests} />}
            {tab === "source" && <Source runId={runId} hasSource={run.has_source} />}
            {tab === "timeline" && <Timeline run={run} />}

            <ConfirmDialog
                open={cancelling}
                onOpenChange={setCancelling}
                title="Cancel this run?"
                description={`${run.username}'s ${run.run_type === "submit" ? "submission" : "run"} stops. No attempt is used; they can run it again.`}
                confirmLabel="Cancel run"
                reasonLabel="Reason"
                minReason={10}
                onConfirm={(reason) => cancelRun.mutate({ runId, reason }, {
                    onSuccess: () => { showAlert(200, "Run cancelled"); refetch(); },
                    onError: (error) => showAlert(error?.status || 500, error?.message || "The run was not cancelled"),
                })}
            />
        </>
    );
}
