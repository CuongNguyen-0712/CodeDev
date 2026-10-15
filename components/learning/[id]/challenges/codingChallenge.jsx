'use client';

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useApp } from "@/contexts/appContext";
import { challengeQueries } from "@/queries/challenge.query";
import { useSubmitCoding } from "@/mutations/challenge.mutation";
import useCodeDraft from "@/hooks/useCodeDraft";
import { detectEntryName, runTests, toSubmissionPayload } from "@/lib/challenges/runner";
import { cn } from "@/lib/utils";

import CodeEditor from "./codeEditor";
import { ErrorReload } from "../../../ui/error";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button, buttonVariants } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

import {
    LuChevronRight,
    LuCircleAlert,
    LuCircleCheck,
    LuCircleX,
    LuClock,
    LuCloud,
    LuListChecks,
    LuLoaderCircle,
    LuLock,
    LuPlay,
    LuRotateCcw,
    LuSave,
    LuSend,
    LuSquareTerminal,
    LuTerminal,
} from "react-icons/lu";

const STATUS_LABEL = {
    passed: "Passed",
    failed: "Failed",
    error: "Error",
    timeout: "Timed out",
    pending: "Graded on submit",
    running: "Running",
    idle: "Not run",
};

function formatValue(value) {
    if (value === undefined) return "undefined";
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function formatTime(timestamp) {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusIcon({ status }) {
    const className = "size-3.5 shrink-0";
    if (status === "passed") return <LuCircleCheck className={cn(className, "text-editor-success")} aria-hidden="true" />;
    if (status === "failed" || status === "error") return <LuCircleX className={cn(className, "text-editor-danger")} aria-hidden="true" />;
    if (status === "timeout") return <LuClock className={cn(className, "text-editor-warning")} aria-hidden="true" />;
    if (status === "pending") return <LuLock className={cn(className, "text-editor-muted")} aria-hidden="true" />;
    if (status === "running") return <LuLoaderCircle className={cn(className, "animate-spin text-editor-accent")} aria-hidden="true" />;
    return <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true"><span className="size-1.5 rounded-full bg-editor-gutter" /></span>;
}

function DraftStatus({ draft }) {
    const base = "flex items-center gap-1.5 font-mono text-[11px]";
    if (draft.status === "unavailable") {
        return <span className={cn(base, "text-editor-muted")}><LuCircleAlert className="size-3" aria-hidden="true" />Local drafts unavailable</span>;
    }
    if (draft.status === "error") {
        return <span className={cn(base, "text-editor-danger")}><LuCircleAlert className="size-3" aria-hidden="true" />Draft not saved</span>;
    }
    if (draft.status === "saving") {
        return <span className={cn(base, "text-editor-muted")}><LuSave className="size-3" aria-hidden="true" />Saving</span>;
    }
    if (draft.lastSavedAt) {
        return <span className={cn(base, "text-editor-muted")}><LuCloud className="size-3" aria-hidden="true" />Saved {formatTime(draft.lastSavedAt)}</span>;
    }
    return null;
}

const darkTabTrigger = "flex-none rounded-none px-2.5 text-xs text-editor-muted hover:text-editor-foreground data-[state=active]:text-editor-foreground after:bg-editor-accent";

export default function CodingChallenge({ challenge, onPassed }) {
    const { showAlert: alert } = useApp();
    const { data: session } = useSession();
    const userId = session?.user?.id;

    const workspaceQuery = useQuery({
        ...challengeQueries.workspace(challenge.id),
        enabled: Boolean(userId && challenge.id),
    });
    const workspace = workspaceQuery.data;

    const draft = useCodeDraft({
        userId,
        challengeId: challenge.id,
        language: workspace?.language,
        starterCode: workspace?.starterCode ?? "",
        server: workspace?.server ?? null,
        enabled: Boolean(workspace),
    });

    const submitCoding = useSubmitCoding();

    const [phase, setPhase] = useState("idle"); // idle | running | submitting
    const [testResults, setTestResults] = useState({});
    const [activePanel, setActivePanel] = useState("output"); // output | tests | console
    const [lastRunMeta, setLastRunMeta] = useState(null);
    const [submission, setSubmission] = useState(null);
    const [expandedTest, setExpandedTest] = useState(null);
    const [resetOpen, setResetOpen] = useState(false);
    const resetButtonRef = useRef(null);

    const entry = useMemo(() => detectEntryName(workspace?.starterCode || ""), [workspace?.starterCode]);
    const tests = workspace?.tests || [];
    const visibleTests = tests.filter((t) => !t.isHidden);
    const hiddenCount = tests.length - visibleTests.length;
    const attemptsLeft = workspace?.maxAttempts ? Math.max(0, workspace.maxAttempts - workspace.attempts) : null;
    const isBusy = phase !== "idle";

    const consoleLines = useMemo(() => Object.values(testResults).flatMap((r) => [
        ...(r.logs || []).map((log) => ({ ...log, test: r.name })),
        ...(r.unhandled || []).map((text) => ({ level: "error", text: `Unhandled rejection: ${text}`, test: r.name })),
    ]), [testResults]);

    if (workspaceQuery.isLoading || (workspace && !draft.ready)) {
        return (
            <div className="overflow-hidden rounded-lg border border-editor-border bg-editor" aria-busy="true" aria-label="Preparing the editor">
                <div className="h-10 border-b border-editor-border bg-editor-panel" />
                <div className="space-y-2.5 p-4">
                    {['w-2/5', 'w-3/5', 'w-1/2', 'w-1/3'].map((width) => (
                        <Skeleton key={width} className={cn("h-3.5 bg-editor-raised", width)} />
                    ))}
                </div>
            </div>
        );
    }

    if (workspaceQuery.isError) {
        return workspaceQuery.error?.status === 403 ? (
            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/60 p-4 text-sm">
                <LuLock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p>{workspaceQuery.error.message}</p>
            </div>
        ) : (
            <ErrorReload data={workspaceQuery.error} refetch={workspaceQuery.refetch} />
        );
    }

    if (!workspace) return null;

    const execute = async (testList) => {
        setTestResults((prev) => ({
            ...prev,
            ...Object.fromEntries(testList.map((t) => [t.id, { id: t.id, name: t.name, isHidden: t.isHidden, status: "running" }])),
        }));

        const startTime = Date.now();
        const results = await runTests({
            code: draft.code,
            harness: workspace.harnessCode,
            entry,
            tests: testList,
            timeLimitMs: workspace.timeLimitMs,
            onProgress: (result) => setTestResults((prev) => ({ ...prev, [result.id]: result })),
        });
        setLastRunMeta({
            duration: Date.now() - startTime,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        });
        return results;
    };

    const handleRun = async () => {
        if (isBusy) return;
        setPhase("running");
        setActivePanel("output");
        setSubmission(null);

        try {
            draft.flush();
            const results = await execute(visibleTests);
            const passed = results.filter((r) => r.status === "passed").length;
            alert(passed === results.length ? 200 : 400, `${passed}/${results.length} sample tests passed.`);
        } catch (error) {
            console.error("Run failed:", error);
            alert(500, "Could not run your code in this browser.");
        } finally {
            setPhase("idle");
        }
    };

    const handleSubmit = async () => {
        if (isBusy) return;
        if (attemptsLeft === 0) {
            alert(429, "You have used all attempts for this challenge.");
            return;
        }

        setPhase("submitting");
        setActivePanel("tests");
        const submittedCode = draft.code;

        try {
            await draft.flush();
            const results = await execute(tests);

            const res = await submitCoding.mutateAsync({
                challengeId: challenge.id,
                code: submittedCode,
                results: toSubmissionPayload(results),
            });

            setSubmission(res);
            setTestResults((prev) => {
                const next = { ...prev };
                for (const graded of res.tests || []) {
                    next[graded.id] = { ...(prev[graded.id] || {}), ...graded, output: graded.actual ?? prev[graded.id]?.output };
                }
                return next;
            });

            await draft.markSubmitted({ code: submittedCode, submissionId: res.submissionId, submittedAt: res.submittedAt });

            if (res.passed) {
                const bonus = res.awardedPoints > 0 ? ` +${res.awardedPoints} points added to your profile.` : "";
                alert(200, `All ${res.testsTotal} tests passed.${bonus}`);
                onPassed?.(challenge.id);
            } else {
                alert(400, `${res.testsPassed}/${res.testsTotal} tests passed. Your submission was saved.`);
            }
        } catch (error) {
            alert(error.status || 500, error.message || "Submission failed. Your draft is still saved locally.");
        } finally {
            setPhase("idle");
        }
    };

    const handleReset = () => {
        if (isBusy) return;
        draft.resetToStarter();
        setTestResults({});
        setSubmission(null);
        setResetOpen(false);
    };

    const displayFile = workspace.filePath || (workspace.language === "python" ? "main.py" : "solution.js");
    const ranVisible = visibleTests.filter((t) => testResults[t.id] && testResults[t.id].status !== "running");
    const passedVisible = ranVisible.filter((t) => testResults[t.id].status === "passed").length;

    const renderTest = (test, index) => {
        const result = testResults[test.id];
        const status = result?.status || (test.isHidden ? "pending" : "idle");
        const isOpen = expandedTest === test.id;
        const canExpand = !test.isHidden && Boolean(result) && status !== "running";

        return (
            <li key={test.id} className="border-b border-editor-border/60 last:border-b-0">
                <button
                    type="button"
                    onClick={() => canExpand && setExpandedTest(isOpen ? null : test.id)}
                    aria-expanded={canExpand ? isOpen : undefined}
                    disabled={!canExpand}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-editor-raised disabled:cursor-default disabled:hover:bg-transparent"
                >
                    <StatusIcon status={status} />
                    <span className="min-w-0 flex-1 truncate text-editor-foreground">
                        {test.isHidden ? `Hidden test ${index + 1}` : test.name}
                    </span>
                    <span className="shrink-0 text-editor-muted tabular">
                        {result?.timeMs ? `${result.timeMs} ms · ` : ""}{STATUS_LABEL[status]}
                    </span>
                    {canExpand && (
                        <LuChevronRight className={cn("size-3.5 shrink-0 text-editor-muted transition-transform", isOpen && "rotate-90")} aria-hidden="true" />
                    )}
                </button>

                {isOpen && canExpand && (
                    <dl className="grid gap-1.5 px-3 pb-3 pl-9 sm:grid-cols-[5.5rem_1fr]">
                        <dt className="text-editor-muted">Input</dt>
                        <dd className="break-all text-editor-foreground">{formatValue(test.input)}</dd>
                        <dt className="text-editor-muted">Expected</dt>
                        <dd className="break-all text-editor-foreground">{formatValue(test.expected)}</dd>
                        <dt className="text-editor-muted">Received</dt>
                        <dd className={cn("break-all", status === "passed" ? "text-editor-success" : "text-editor-danger")}>
                            {result.error ? result.error : formatValue(result.output)}
                        </dd>
                    </dl>
                )}
            </li>
        );
    };

    const editorActions = (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        ref={resetButtonRef}
                        onClick={() => setResetOpen(true)}
                        disabled={isBusy}
                        aria-label="Reset to starter code"
                        className="text-editor-muted hover:bg-editor-raised hover:text-editor-foreground"
                    >
                        <LuRotateCcw />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Reset to starter code</TooltipContent>
            </Tooltip>
            <Button
                type="button"
                size="xs"
                onClick={handleRun}
                disabled={isBusy}
                className="bg-editor-raised text-editor-foreground hover:bg-editor-border"
                title="Run sample tests (Ctrl+Enter)"
            >
                {phase === "running" ? <LuLoaderCircle className="animate-spin" /> : <LuPlay />}
                Run
            </Button>
            <Button
                type="button"
                size="xs"
                onClick={handleSubmit}
                disabled={isBusy || attemptsLeft === 0 || !draft.code.trim()}
                title="Run every test and submit for grading"
            >
                {phase === "submitting" ? <LuLoaderCircle className="animate-spin" /> : <LuSend />}
                Submit
            </Button>
        </>
    );

    return (
        <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-editor-border bg-editor text-editor-foreground shadow-sm">
                <CodeEditor
                    value={draft.code}
                    onChange={draft.setCode}
                    onSave={draft.flush}
                    onRun={handleRun}
                    fileName={displayFile}
                    language={workspace.language}
                    readOnly={phase === "submitting"}
                    ariaLabel={`Code editor for ${challenge.title}`}
                    status={<DraftStatus draft={draft} />}
                    actions={editorActions}
                />

                {/* Output panel */}
                <Tabs value={activePanel} onValueChange={setActivePanel} className="gap-0 border-t border-editor-border">
                    <div className="flex flex-wrap items-center gap-x-3 bg-editor-panel pr-3">
                        <TabsList variant="line" className="h-9 justify-start bg-transparent p-0">
                            <TabsTrigger value="output" className={darkTabTrigger}>
                                <LuSquareTerminal />
                                Output
                            </TabsTrigger>
                            <TabsTrigger value="tests" className={darkTabTrigger}>
                                <LuListChecks />
                                Tests
                                <span className="font-mono text-[10px] text-editor-muted tabular">{tests.length}</span>
                            </TabsTrigger>
                            <TabsTrigger value="console" className={darkTabTrigger}>
                                <LuTerminal />
                                Console
                                <span className="font-mono text-[10px] text-editor-muted tabular">{consoleLines.length}</span>
                            </TabsTrigger>
                        </TabsList>
                        <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-editor-muted tabular">
                            {attemptsLeft !== null && (
                                <span>{attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} left</span>
                            )}
                            {lastRunMeta && (
                                <span className="max-sm:hidden">{lastRunMeta.duration} ms at {lastRunMeta.time}</span>
                            )}
                        </div>
                    </div>

                    <div className="h-52 overflow-auto font-mono text-xs leading-relaxed" aria-live="polite">
                        <TabsContent value="output" className="p-3">
                            {phase === "running" ? (
                                <p className="flex items-center gap-2 text-editor-muted">
                                    <LuLoaderCircle className="size-3.5 animate-spin text-editor-accent" aria-hidden="true" />
                                    Running sample tests in the browser sandbox...
                                </p>
                            ) : ranVisible.length > 0 ? (
                                <div className="space-y-2">
                                    <p className={passedVisible === ranVisible.length ? "text-editor-success" : "text-editor-danger"}>
                                        {passedVisible === ranVisible.length
                                            ? `All ${passedVisible} sample tests passed.`
                                            : `${ranVisible.length - passedVisible} of ${ranVisible.length} sample tests failed.`}
                                    </p>
                                    <ul className="list-none space-y-1">
                                        {ranVisible.map((t) => {
                                            const r = testResults[t.id];
                                            return (
                                                <li key={t.id} className="flex gap-2">
                                                    <span className="text-editor-gutter" aria-hidden="true">&gt;</span>
                                                    <span className="shrink-0 text-editor-muted">{t.name}:</span>
                                                    <span className={cn("break-all", r.status === "passed" ? "text-editor-foreground" : "text-editor-danger")}>
                                                        {r.error ? r.error : formatValue(r.output)}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-editor-muted">
                                    Run your code (Ctrl+Enter) to check it against the sample tests.
                                </p>
                            )}
                        </TabsContent>

                        <TabsContent value="tests">
                            {tests.length === 0 ? (
                                <p className="p-3 text-editor-muted">No test cases are configured for this challenge.</p>
                            ) : (
                                <>
                                    <ul className="list-none">
                                        {visibleTests.map((t, i) => renderTest(t, i))}
                                        {tests.filter((t) => t.isHidden).map((t, i) => renderTest(t, i))}
                                    </ul>
                                    {hiddenCount > 0 && (
                                        <p className="flex items-center gap-1.5 px-3 py-2 text-editor-muted">
                                            <LuLock className="size-3" aria-hidden="true" />
                                            {hiddenCount} hidden test{hiddenCount === 1 ? '' : 's'} are graded on the server when you submit.
                                        </p>
                                    )}
                                </>
                            )}
                        </TabsContent>

                        <TabsContent value="console" className="p-3">
                            {consoleLines.length === 0 ? (
                                <p className="text-editor-muted">
                                    Output from console.log appears here after a run.
                                </p>
                            ) : (
                                <ol className="list-none space-y-1">
                                    {consoleLines.map((line, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="shrink-0 rounded-sm bg-editor-raised px-1 text-[10px] text-editor-muted">{line.test}</span>
                                            <code className={cn(
                                                "break-all",
                                                line.level === "error" ? "text-editor-danger" : line.level === "warn" ? "text-editor-warning" : "text-editor-foreground"
                                            )}>
                                                {line.text}
                                            </code>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

            {submission && (
                <div
                    role="status"
                    className={cn(
                        "flex items-start gap-3 rounded-lg border p-3.5",
                        submission.passed ? "border-success/30 bg-success-soft" : "border-warning/30 bg-warning-soft"
                    )}
                >
                    {submission.passed
                        ? <LuCircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                        : <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />}
                    <div className="space-y-0.5 text-sm">
                        <p className="font-medium text-foreground">
                            {submission.passed ? 'Challenge solved' : 'Not all tests passed yet'}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground tabular">
                            {submission.testsPassed}/{submission.testsTotal} tests &middot; score {submission.score}/{submission.points} pts
                            {submission.awardedPoints > 0 && ` · +${submission.awardedPoints} pts earned`}
                        </p>
                    </div>
                </div>
            )}

            <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
                <AlertDialogContent
                    onCloseAutoFocus={(event) => {
                        // Opened without a Trigger, so return focus to the reset button explicitly.
                        event.preventDefault();
                        resetButtonRef.current?.focus();
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset to the starter code?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Your current draft for this challenge will be replaced. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep my code</AlertDialogCancel>
                        <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={handleReset}>
                            Reset code
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
