'use client';

import { devLog } from "@/lib/userMessage";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useApp } from "@/contexts/appContext";
import { announceRewards } from "@/components/ui/level";
import { challengeQueries } from "@/queries/challenge.query";
import { codeSubmissionKeys, codeSubmissionQueries } from "@/queries/codeSubmission.query";
import { useRunCodingSamples, useSubmitCoding } from "@/mutations/challenge.mutation";
import useCodeDraft from "@/hooks/useCodeDraft";
import { detectEntryName, runTests, toSubmissionPayload } from "@/lib/challenges/runner";
import { entryBodyStart } from "@/lib/challenges/entry";
import { PLACEHOLDER_RE } from "@/lib/challenges/pieces";
import { isBrowserLanguage, isConfigLanguage, toRunnableCode } from "@/lib/challenges/languages";
import { cn } from "@/lib/utils";

import CodeEditor from "./codeEditor";
import SnippetPanel from "./snippetPanel";
import ResizeHandle from "./resizeHandle";
import SubmissionHistory from "./submissionHistory";
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
    LuHistory,
    LuListChecks,
    LuLoaderCircle,
    LuLock,
    LuMaximize2,
    LuMinimize2,
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
    pending: "Runs on submit",
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

// Outside the component: reading the clock is fine in event handlers, but the compiler cannot tell
// a handler declared in the render body from render code (react-hooks/purity).
async function timed(run) {
    const started = Date.now();
    const value = await run();
    return { value, duration: Date.now() - started };
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

export default function CodingChallenge({ challenge, onPassed, onExhausted }) {
    const { showAlert: alert } = useApp();
    const { data: session } = useSession();
    const userId = session?.user?.id;

    const workspaceQuery = useQuery({
        ...challengeQueries.workspace(challenge.id),
        enabled: Boolean(userId && challenge.id),
    });
    const workspace = workspaceQuery.data;

    const queryClient = useQueryClient();
    const historyQuery = useQuery({
        ...codeSubmissionQueries.history(challenge.id),
        enabled: Boolean(userId && challenge.id),
    });

    const draft = useCodeDraft({
        userId,
        challengeId: challenge.id,
        language: workspace?.language,
        starterCode: workspace?.starterCode ?? "",
        server: workspace?.server ?? null,
        enabled: Boolean(workspace),
    });

    const submitCoding = useSubmitCoding();
    const runSamples = useRunCodingSamples();

    const [phase, setPhase] = useState("idle"); // idle | running | submitting
    const [testResults, setTestResults] = useState({});
    const [activePanel, setActivePanel] = useState("output"); // output | tests | console | history
    const [lastRunMeta, setLastRunMeta] = useState(null);
    const [submission, setSubmission] = useState(null);
    const [expandedTest, setExpandedTest] = useState(null);
    // Replacing the draft (reset to starter, restore a submission) is confirmed first.
    const [confirm, setConfirm] = useState(null); // { kind: "reset" } | { kind: "restore", code, attempt }
    const confirmTriggerRef = useRef(null);
    const editorRef = useRef(null);
    // Expanded: the workspace (editor, pieces, output) covers the whole window.
    const [expanded, setExpanded] = useState(false);
    // Width of the pieces column in the expanded workspace (desktop), remembered in this browser.
    const [piecesWidth, setPiecesWidth] = useState(() => {
        try {
            const saved = Number(typeof window === "undefined" ? 0 : localStorage.getItem("codedev:pieces-width"));
            return saved >= 260 ? saved : 416;
        } catch {
            return 416;
        }
    });
    const resizePieces = (width) => {
        setPiecesWidth(width);
        try {
            localStorage.setItem("codedev:pieces-width", String(width));
        } catch {
            // Storage blocked: the width lasts for this page.
        }
    };
    // Height of the output panel (Output / Tests / Console / History), remembered in this browser.
    const [outputHeight, setOutputHeight] = useState(() => {
        if (typeof window === "undefined") return 240;
        try {
            const saved = Number(localStorage.getItem("codedev:output-height"));
            if (saved >= 96) return saved;
        } catch {
            // Storage blocked: use the default.
        }
        return Math.round(Math.min(320, Math.max(160, window.innerHeight * 0.3)));
    });
    const resizeOutput = (height) => {
        setOutputHeight(height);
        try {
            localStorage.setItem("codedev:output-height", String(height));
        } catch {
            // Storage blocked: the height lasts for this page.
        }
    };
    // shortcut: used marks last one page load; persist them in draftStore if learners ask for it
    const [usedSnippets, setUsedSnippets] = useState(() => new Set());
    // Fix-bug pieces: shown when a fix is clicked with no lines selected.
    const [pieceHint, setPieceHint] = useState(null);

    // Sample tests only: hidden test inputs arrive from the server once a submission has started.
    const [hiddenTests, setHiddenTests] = useState([]);
    // Last Run: which code it ran and whether every sample test passed. Submit is only offered
    // for exactly that code.
    const [lastRun, setLastRun] = useState(null);

    // Config files (Dockerfile, nginx.conf, YAML) have no entry function: the harness reads `__source`.
    const entry = useMemo(
        () => (isConfigLanguage(workspace?.language) ? null : detectEntryName(workspace?.starterCode || "")),
        [workspace?.starterCode, workspace?.language]
    );
    const visibleTests = (workspace?.tests || []).filter((t) => !t.isHidden);
    const hiddenCount = Number(workspace?.hiddenCount) || hiddenTests.length;
    const maxAttempts = Number(workspace?.maxAttempts) || 5;
    const attemptsLeft = Math.max(0, maxAttempts - (Number(workspace?.attempts) || 0));
    const isBusy = phase !== "idle";
    const samplesPassedForCode = Boolean(lastRun?.allPassed && lastRun.code === draft.code);
    const canSubmit = !isBusy && attemptsLeft > 0 && samplesPassedForCode && Boolean(draft.code.trim());

    useEffect(() => {
        if (workspace?.hasPassed) onPassed?.(challenge.id, { initial: true });
        // Report a previous pass once when the workspace loads.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspace?.hasPassed, challenge.id]);

    // Every attempt used without a pass: the lesson can move on without this challenge.
    const isExhausted = Boolean(workspace) && attemptsLeft === 0 && !workspace.hasPassed;
    useEffect(() => {
        if (isExhausted) onExhausted?.(challenge.id, { initial: !submitCoding.isSuccess && !submitCoding.isError });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isExhausted, challenge.id]);

    // Expanded workspace: the page behind does not scroll, and Esc leaves it. Inside the code
    // editor Esc belongs to the editor (it releases Tab), so it only closes from elsewhere.
    useEffect(() => {
        if (!expanded) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (event) => {
            if (event.key === "Escape" && !event.defaultPrevented && event.target?.tagName !== "TEXTAREA") setExpanded(false);
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener("keydown", onKey);
        };
    }, [expanded]);

    const consoleLines = useMemo(() => Object.values(testResults).flatMap((r) => [
        ...(r.logs || []).map((log) => ({ ...log, test: r.name })),
        ...(r.unhandled || []).map((text) => ({ level: "error", text: `Unhandled rejection: ${text}`, test: r.name })),
    ]), [testResults]);

    if (workspaceQuery.isLoading || (workspace && !draft.ready)) {
        return (
            <div className="overflow-hidden rounded-lg border border-editor-border bg-editor max-sm:-mx-5 max-sm:rounded-none max-sm:border-x-0" aria-busy="true" aria-label="Preparing the editor">
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

        // javascript and config files run in the browser; other languages run their sample tests in the code runner.
        const inBrowser = isBrowserLanguage(workspace.language);
        const { value: results, duration } = await timed(async () => inBrowser
            ? runTests({
                code: toRunnableCode(workspace.language, draft.code),
                harness: workspace.harnessCode,
                entry,
                tests: testList,
                timeLimitMs: workspace.timeLimitMs,
                onProgress: (result) => setTestResults((prev) => ({ ...prev, [result.id]: result })),
            })
            : (await runSamples.mutateAsync({ challengeId: challenge.id, code: draft.code })).tests.map((t) => ({
                ...t, logs: [], timedOut: t.status === "timeout",
            })));
        if (!inBrowser) {
            setTestResults((prev) => ({ ...prev, ...Object.fromEntries(results.map((r) => [r.id, r])) }));
        }
        setLastRunMeta({
            duration,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        });
        return results;
    };

    const handleRun = async () => {
        if (isBusy) return;
        setPhase("running");
        setActivePanel("output");
        setSubmission(null);

        const ranCode = draft.code;

        try {
            draft.flush();
            const results = await execute(visibleTests);
            const passed = results.filter((r) => r.status === "passed").length;
            const allPassed = passed === results.length;

            setLastRun({ code: ranCode, allPassed, payload: toSubmissionPayload(results) });
            alert(
                allPassed ? 200 : 400,
                allPassed
                    ? `All ${results.length} sample tests passed. You can submit now.`
                    : `${passed}/${results.length} sample tests passed. Pass all of them to submit.`
            );
        } catch (error) {
            setLastRun(null);
            devLog("Run failed:", error);
            alert(error.status || 500, error.status ? error.message : "Could not run your code in this browser.");
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
        if (!samplesPassedForCode) {
            alert(400, "Run your code and pass every sample test before submitting.");
            return;
        }

        setPhase("submitting");
        setActivePanel("tests");
        const submittedCode = draft.code;

        try {
            await draft.flush();

            const res = await submitCoding.mutateAsync({
                challengeId: challenge.id,
                code: submittedCode,
                serverGraded: Boolean(workspace.serverGraded),
                results: lastRun.payload,
                // Hidden tests only exist client-side after the attempt is recorded.
                runHidden: async (hidden) => {
                    setHiddenTests(hidden);
                    if (hidden.length === 0) return {};
                    return toSubmissionPayload(await execute(hidden));
                },
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
                announceRewards(res, {
                    title: `All ${res.testsTotal} tests passed`,
                    id: `challenge-passed:${challenge.id}`,
                });
                onPassed?.(challenge.id);
            } else {
                alert(400, `${res.testsPassed}/${res.testsTotal} tests passed. Your submission was saved.`);
            }
        } catch (error) {
            const message = error.attemptUsed
                ? `${error.message || "Grading failed."} This submission still counted as an attempt.`
                : error.message || "Submission failed. Your draft is still saved locally.";
            alert(error.status || 500, message);
        } finally {
            setPhase("idle");
            // Any started submission used an attempt, graded or not: refresh the history.
            queryClient.invalidateQueries({ queryKey: codeSubmissionKeys.history(challenge.id) });
        }
    };

    const openConfirm = (next, trigger) => {
        confirmTriggerRef.current = trigger || null;
        setConfirm(next);
    };

    const handleConfirm = () => {
        if (isBusy || !confirm) return;
        if (confirm.kind === "restore") {
            draft.setCode(confirm.code);
            alert(200, `Submission #${confirm.attempt} restored to the editor. Run it again before submitting.`);
        } else {
            draft.resetToStarter();
            setUsedSnippets(new Set());
        }
        setTestResults({});
        setSubmission(null);
        setLastRun(null);
        setConfirm(null);
    };

    // Every challenge has a starter file name; this fallback predates config challenges.
    const displayFile = workspace.filePath || "solution.js";
    const snippets = workspace.snippets || [];
    // A fix_bug starter without [ ] lines is the faulty program: each piece replaces the lines the
    // learner selects (build-pieces.mjs bugs/), so finding the faulty lines is part of the exercise.
    const fixMode = challenge.type === "fix_bug" && snippets.length > 0
        && !String(workspace.starterCode || "").split("\n").some((line) => PLACEHOLDER_RE.test(line));
    // Build mode: an empty [ ] line usually means the file does not compile yet, so say so up front.
    const unplaced = snippets.length > 0 && !fixMode ? draft.code.split("\n").filter((line) => PLACEHOLDER_RE.test(line)).length : 0;

    const toggleSnippet = (id) => setUsedSnippets((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    const markUsed = (id) => setUsedSnippets((prev) => new Set(prev).add(id));
    // At the caret once the learner has used the editor, else at the start of the function body
    // (the top of a config file). The piece never picks its own place: that is the exercise.
    const insertSnippet = (snippet) => {
        if (fixMode) {
            const placed = editorRef.current?.replaceSelection(snippet.code);
            if (placed) markUsed(snippet.id);
            setPieceHint(placed ? null : "Select the faulty lines in the editor first: the fix replaces the lines you select.");
            return;
        }
        if (editorRef.current?.insertAtCursor(snippet.code, entryBodyStart(draft.code) ?? 0)) markUsed(snippet.id);
    };
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
                        onClick={() => setExpanded((value) => !value)}
                        aria-pressed={expanded}
                        aria-label={expanded ? "Exit full screen" : "Expand the workspace"}
                        className="size-7 sm:size-6 text-editor-muted hover:bg-editor-raised hover:text-editor-foreground"
                    >
                        {expanded ? <LuMinimize2 /> : <LuMaximize2 />}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{expanded ? "Exit full screen (Esc)" : "Expand the workspace"}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={(event) => openConfirm({ kind: "reset" }, event.currentTarget)}
                        disabled={isBusy}
                        aria-label="Reset to starter code"
                        className="size-7 sm:size-6 text-editor-muted hover:bg-editor-raised hover:text-editor-foreground"
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
                className="h-7 px-2.5 sm:h-6 sm:px-2 bg-editor-raised text-editor-foreground hover:bg-editor-border font-medium"
                title="Run sample tests (Ctrl+Enter)"
            >
                {phase === "running" ? <LuLoaderCircle className="animate-spin" /> : <LuPlay />}
                Run
            </Button>
            <Button
                type="button"
                size="xs"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="h-7 px-2.5 sm:h-6 sm:px-2 font-medium"
                title={
                    attemptsLeft === 0 ? "No attempts left"
                        : samplesPassedForCode ? "Submit: saves this code and runs the hidden tests (uses 1 attempt)"
                            : "Pass every sample test with Run to unlock Submit"
                }
            >
                {phase === "submitting" ? <LuLoaderCircle className="animate-spin" /> : <LuSend />}
                Submit
            </Button>
        </>
    );

    return (
        <div className="space-y-3">
            {/* Phones: bleed past the lesson's px-5 gutter so code gets the full screen width.
                Expanded: the same workspace fixed over the whole window. */}
            <div
                role={expanded ? "dialog" : undefined}
                aria-modal={expanded || undefined}
                aria-label={expanded ? `${challenge.title}: workspace` : undefined}
                className={cn(
                    "overflow-hidden bg-editor text-editor-foreground",
                    expanded
                        ? "fixed inset-0 z-50 flex flex-col"
                        : "rounded-lg border border-editor-border max-sm:-mx-5 max-sm:rounded-none max-sm:border-x-0"
                )}
            >
                {/* Pieces: under the editor in the lesson; a column beside it when expanded (lg). */}
                <div className={cn(expanded && "flex min-h-0 flex-1 flex-col lg:flex-row")}>
                    <div className={cn(expanded && "flex min-h-0 min-w-0 flex-1 flex-col")}>
                        <CodeEditor
                            expanded={expanded}
                            ref={editorRef}
                            onDropSnippet={markUsed}
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
                    </div>
                    {snippets.length > 0 && expanded && (
                        <ResizeHandle
                            axis="x"
                            invert
                            value={piecesWidth}
                            min={260}
                            max={720}
                            onChange={resizePieces}
                            label="Resize the pieces column"
                            className="border-l border-editor-border max-lg:hidden"
                        />
                    )}
                    {snippets.length > 0 && (
                        <SnippetPanel
                            snippets={snippets}
                            used={usedSnippets}
                            onToggle={toggleSnippet}
                            onInsert={insertSnippet}
                            note={fixMode
                                ? pieceHint || "Select the faulty lines, then click the fix (or drop it on them)."
                                : unplaced ? `${unplaced} [ ] ${unplaced === 1 ? "line is" : "lines are"} still empty: the code may not run until each has a piece.` : null}
                            noteIsWarning={Boolean(fixMode && pieceHint)}
                            disabled={phase === "submitting"}
                            layout={expanded ? "column" : "grid"}
                            className={cn(
                                "border-t border-editor-border",
                                expanded && "max-lg:max-h-[30svh] lg:w-(--pieces-width) lg:shrink-0 lg:border-t-0"
                            )}
                            style={expanded ? { "--pieces-width": `${piecesWidth}px` } : undefined}
                        />
                    )}
                </div>

                {/* Output panel: drag the handle up for a taller panel (the expanded editor gives way). */}
                <ResizeHandle
                    axis="y"
                    invert
                    value={outputHeight}
                    min={96}
                    max={typeof window === "undefined" ? 600 : Math.round(window.innerHeight * 0.7)}
                    onChange={resizeOutput}
                    label="Resize the output panel"
                    className="border-t border-editor-border"
                />
                <Tabs value={activePanel} onValueChange={setActivePanel} className="gap-0">
                    {/* Below sm the tabs show icon + count only; the label stays for screen readers. */}
                    <div className="flex items-center gap-x-3 bg-editor-panel pr-3">
                        <TabsList variant="line" className="h-9 min-w-0 justify-start overflow-x-auto overflow-y-hidden bg-transparent p-0">
                            <TabsTrigger value="output" className={darkTabTrigger}>
                                <LuSquareTerminal />
                                <span className="max-sm:sr-only">Output</span>
                            </TabsTrigger>
                            <TabsTrigger value="tests" className={darkTabTrigger}>
                                <LuListChecks />
                                <span className="max-sm:sr-only">Tests</span>
                                <span className="font-mono text-[11px] text-editor-muted tabular">{visibleTests.length + hiddenCount}</span>
                            </TabsTrigger>
                            <TabsTrigger value="console" className={darkTabTrigger}>
                                <LuTerminal />
                                <span className="max-sm:sr-only">Console</span>
                                <span className="font-mono text-[11px] text-editor-muted tabular">{consoleLines.length}</span>
                            </TabsTrigger>
                            <TabsTrigger value="history" className={darkTabTrigger}>
                                <LuHistory />
                                <span className="max-sm:sr-only">History</span>
                                {historyQuery.data && (
                                    <span className="font-mono text-[11px] text-editor-muted tabular">{historyQuery.data.submissions.length}</span>
                                )}
                            </TabsTrigger>
                        </TabsList>
                        <div className="ml-auto flex shrink-0 items-center gap-3 font-mono text-[11px] text-editor-muted tabular">
                            <span className={attemptsLeft === 0 ? "text-editor-danger" : undefined}>
                                {attemptsLeft}/{maxAttempts}<span className="max-sm:hidden"> attempt{attemptsLeft === 1 ? '' : 's'}</span> left
                            </span>
                            {lastRunMeta && (
                                <span className="max-sm:hidden">{lastRunMeta.duration} ms at {lastRunMeta.time}</span>
                            )}
                        </div>
                    </div>

                    <div className="overflow-auto font-mono text-xs leading-relaxed" style={{ height: outputHeight }} aria-live="polite">
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
                                            : `${ranVisible.length - passedVisible} of ${ranVisible.length} sample tests failed. Fix them to unlock Submit.`}
                                    </p>
                                    {lastRun?.allPassed && lastRun.code !== draft.code && (
                                        <p className="text-editor-warning">Code changed since the last run. Run again before submitting.</p>
                                    )}
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
                            {visibleTests.length + hiddenCount === 0 ? (
                                <p className="p-3 text-editor-muted">No test cases are configured for this challenge.</p>
                            ) : (
                                <>
                                    <ul className="list-none">
                                        {visibleTests.map((t, i) => renderTest(t, i))}
                                        {hiddenTests.length > 0
                                            ? hiddenTests.map((t, i) => renderTest(t, i))
                                            : Array.from({ length: hiddenCount }, (_, i) => renderTest({ id: `hidden-${i}`, isHidden: true }, i))}
                                    </ul>
                                    {hiddenCount > 0 && (
                                        <p className="flex items-center gap-1.5 px-3 py-2 text-editor-muted">
                                            <LuLock className="size-3" aria-hidden="true" />
                                            {hiddenCount} hidden test{hiddenCount === 1 ? '' : 's'} run only when you submit. Pass every sample test first.
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
                                            <span className="shrink-0 rounded-sm bg-editor-raised px-1 text-[11px] text-editor-muted">{line.test}</span>
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

                        <TabsContent value="history">
                            <SubmissionHistory
                                challengeId={challenge.id}
                                history={historyQuery}
                                maxAttempts={maxAttempts}
                                restoreDisabled={isBusy}
                                onRestore={(code, item, trigger) => openConfirm({ kind: "restore", code, attempt: item.attempt }, trigger)}
                            />
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
                        <p className="text-xs text-muted-foreground tabular">
                            {submission.testsPassed}/{submission.testsTotal} tests &middot; score {submission.score}/{submission.points} pts
                            {submission.awardedPoints > 0 && ` · +${submission.awardedPoints} pts earned`}
                            {submission.awardedExp > 0 && ` · +${submission.awardedExp} EXP`}
                        </p>
                    </div>
                </div>
            )}

            <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
                <AlertDialogContent
                    onCloseAutoFocus={(event) => {
                        // Opened without a Trigger, so return focus to the button that opened it.
                        event.preventDefault();
                        confirmTriggerRef.current?.focus();
                    }}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirm?.kind === "restore" ? `Restore submission #${confirm.attempt}?` : "Reset to the starter code?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm?.kind === "restore"
                                ? "Your current draft will be replaced by the code of this submission. Press Ctrl+Z in the editor to get it back."
                                : "Your current draft for this challenge will be replaced. Press Ctrl+Z in the editor to get it back."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep my code</AlertDialogCancel>
                        <AlertDialogAction
                            className={confirm?.kind === "restore" ? undefined : buttonVariants({ variant: 'destructive' })}
                            onClick={handleConfirm}
                        >
                            {confirm?.kind === "restore" ? "Restore code" : "Reset code"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
