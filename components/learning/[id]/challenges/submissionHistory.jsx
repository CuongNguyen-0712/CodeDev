'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

import { codeSubmissionQueries } from "@/queries/codeSubmission.query";
import { syntaxTheme } from "@/lib/syntaxTheme";
import { cn } from "@/lib/utils";

import { Button } from "@/components/shadcn/button";

import {
    LuChevronRight,
    LuCircleCheck,
    LuCircleX,
    LuClockAlert,
    LuHistory,
    LuLoaderCircle,
    LuRotateCcw,
} from "react-icons/lu";

const STATUS = {
    passed: { label: "Passed", icon: LuCircleCheck, className: "text-editor-success" },
    failed: { label: "Failed", icon: LuCircleX, className: "text-editor-danger" },
    pending: { label: "Grading", icon: LuLoaderCircle, className: "text-editor-accent" },
    expired: { label: "Expired", icon: LuClockAlert, className: "text-editor-warning" },
};

const relativeTime = typeof Intl !== "undefined" && Intl.RelativeTimeFormat
    ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
    : null;

function formatRelative(iso) {
    if (!iso) return "";
    if (!relativeTime) return new Date(iso).toLocaleString();
    let value = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const steps = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
    for (const [size, unit] of steps) {
        if (Math.abs(value) < size) return relativeTime.format(value, unit);
        value = Math.round(value / size);
    }
    return relativeTime.format(value, "year");
}

const ghostDark = "text-editor-muted hover:bg-editor-raised hover:text-editor-foreground";

function SubmissionCode({ challengeId, submission, onRestore, restoreDisabled }) {
    const { data, isLoading, isError, error, refetch } = useQuery(codeSubmissionQueries.code(challengeId, submission.id));

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 px-3 pb-3 pl-9 text-editor-muted">
                <LuLoaderCircle className="size-3.5 animate-spin text-editor-accent" aria-hidden="true" />
                Loading the submitted code...
            </p>
        );
    }

    if (isError) {
        return (
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pl-9 text-editor-danger">
                <span>{error?.message || "Could not load this submission."}</span>
                <Button type="button" size="xs" variant="ghost" onClick={() => refetch()} className={ghostDark}>
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-2 px-3 pb-3 pl-9">
            <div
                tabIndex={0}
                role="region"
                aria-label={`Code of submission ${submission.attempt}`}
                className="max-h-56 overflow-auto rounded-md border border-editor-border bg-editor-panel text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-editor-accent/60"
            >
                <SyntaxHighlighter
                    language={data?.language || submission.language || "javascript"}
                    style={syntaxTheme}
                    PreTag="div"
                    showLineNumbers
                    lineNumberStyle={{ minWidth: "2.25em", paddingRight: "1em", color: "var(--editor-gutter)", textAlign: "right", userSelect: "none" }}
                    customStyle={{ margin: 0, padding: "calc(var(--spacing) * 2.5) calc(var(--spacing) * 3)", background: "transparent", overflow: "visible", width: "max-content", minWidth: "100%" }}
                >
                    {data?.code || ""}
                </SyntaxHighlighter>
            </div>
            <Button
                type="button"
                size="xs"
                onClick={(event) => onRestore(data?.code || "", submission, event.currentTarget)}
                disabled={restoreDisabled || !data?.code}
                className="bg-editor-raised text-editor-foreground hover:bg-editor-border"
            >
                <LuRotateCcw />
                Restore to editor
            </Button>
        </div>
    );
}

/**
 * Every submission of the learner for one coding challenge, newest first.
 * `history` is the useQuery result of codeSubmissionQueries.history.
 */
export default function SubmissionHistory({ challengeId, history, maxAttempts, onRestore, restoreDisabled = false }) {
    const [openId, setOpenId] = useState(null);

    if (history.isLoading) {
        return (
            <p className="flex items-center gap-2 p-3 text-editor-muted">
                <LuLoaderCircle className="size-3.5 animate-spin text-editor-accent" aria-hidden="true" />
                Loading your submissions...
            </p>
        );
    }

    if (history.isError) {
        return (
            <div className="flex flex-wrap items-center gap-2 p-3 text-editor-danger">
                <span>{history.error?.message || "Could not load your submissions."}</span>
                <Button type="button" size="xs" variant="ghost" onClick={() => history.refetch()} className={ghostDark}>
                    Retry
                </Button>
            </div>
        );
    }

    const submissions = history.data?.submissions || [];
    const points = history.data?.points || 0;

    if (submissions.length === 0) {
        return (
            <p className="flex items-center gap-2 p-3 text-editor-muted">
                <LuHistory className="size-3.5 shrink-0" aria-hidden="true" />
                No submissions yet. Every submit is listed here with its result
                {maxAttempts ? ` (${maxAttempts} attempts in total).` : "."}
            </p>
        );
    }

    return (
        <ol className="list-none">
            {submissions.map((item) => {
                const status = STATUS[item.status] || STATUS.failed;
                const StatusGlyph = status.icon;
                const isOpen = openId === item.id;
                const hasTests = item.testsTotal !== null && item.testsTotal !== undefined;

                return (
                    <li key={item.id} className="border-b border-editor-border/60 last:border-b-0">
                        <button
                            type="button"
                            onClick={() => setOpenId(isOpen ? null : item.id)}
                            aria-expanded={isOpen}
                            className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left hover:bg-editor-raised"
                        >
                            <span className="flex min-w-0 items-center gap-2.5">
                                <StatusGlyph
                                    className={cn("size-3.5 shrink-0", status.className, item.status === "pending" && "animate-spin")}
                                    aria-hidden="true"
                                />
                                <span className="text-editor-foreground tabular">#{item.attempt}</span>
                                <span className={status.className}>{status.label}</span>
                            </span>
                            <span className="ml-auto flex items-center gap-3 text-editor-muted tabular">
                                {hasTests && <span>{item.testsPassed ?? 0}/{item.testsTotal} tests</span>}
                                {item.score !== null && <span>{item.score}/{points} pts</span>}
                                {item.executionTimeMs !== null && <span className="max-sm:hidden">{item.executionTimeMs} ms</span>}
                                <time
                                    dateTime={item.submittedAt || undefined}
                                    title={item.submittedAt ? new Date(item.submittedAt).toLocaleString() : undefined}
                                >
                                    {formatRelative(item.submittedAt)}
                                </time>
                                <LuChevronRight className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-90")} aria-hidden="true" />
                            </span>
                        </button>

                        {isOpen && (
                            <>
                                {item.errorMessage && (
                                    <p className="px-3 pb-2 pl-9 break-all text-editor-danger">{item.errorMessage}</p>
                                )}
                                {item.status === "expired" && (
                                    <p className="px-3 pb-2 pl-9 text-editor-warning">
                                        Grading did not finish in time. This attempt still counts.
                                    </p>
                                )}
                                <SubmissionCode
                                    challengeId={challengeId}
                                    submission={item}
                                    onRestore={onRestore}
                                    restoreDisabled={restoreDisabled}
                                />
                            </>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
