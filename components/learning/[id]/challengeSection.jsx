'use client';

import { createContext, useContext, useEffect, useState } from "react";

import QuizChallenge from "./challenges/quizChallenge";
import CodingChallenge from "./challenges/codingChallenge";

import { Badge } from "@/components/shadcn/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

import { LuBug, LuCheck, LuCode, LuListChecks, LuLock } from "react-icons/lu";

const TYPE_META = {
    quiz: { label: "Knowledge check", Icon: LuListChecks },
    fix_bug: { label: "Fix the bug", Icon: LuBug },
    mini_coding: { label: "Coding challenge", Icon: LuCode },
};

const DIFFICULTY = {
    easy: { label: 'Easy', variant: 'success' },
    medium: { label: 'Medium', variant: 'warning' },
    hard: { label: 'Hard', variant: 'destructive' },
};

// `#challenge-<id>` in the URL points at the challenge the learner last worked on.
const HASH_PREFIX = "#challenge-";
export const challengeAnchorId = (challengeId) => `challenge-${challengeId}`;

function readHashChallengeId() {
    if (typeof window === "undefined") return null;
    const { hash } = window.location;
    return hash.startsWith(HASH_PREFIX) ? decodeURIComponent(hash.slice(HASH_PREFIX.length)) : null;
}

// Updates the hash without a navigation (no re-render of the page, no history entry).
function writeHashChallengeId(challengeId) {
    if (typeof window === "undefined") return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}${HASH_PREFIX}${encodeURIComponent(challengeId)}`);
}

function challengePoints(challenge) {
    if (challenge.type === "quiz") {
        return (challenge.questions || []).reduce((sum, q) => sum + (Number(q.points) || 0), 0);
    }
    return Number(challenge.points) || 0;
}

function ChallengeHeader({ challenge, isDone, isExhausted }) {
    const { label, Icon } = TYPE_META[challenge.type];
    const points = challengePoints(challenge);
    const difficulty = DIFFICULTY[challenge.difficulty] || { label: challenge.difficulty || 'Easy', variant: 'muted' };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Icon className="size-3.5" aria-hidden="true" />
                    {label}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    <Badge variant={difficulty.variant}>{difficulty.label}</Badge>
                    {points > 0 && (
                        <Badge variant="outline" className="font-mono tabular">{points} pts</Badge>
                    )}
                    {isDone && (
                        <Badge variant="success"><LuCheck aria-hidden="true" />Passed</Badge>
                    )}
                    {isExhausted && (
                        <Badge variant="warning"><LuLock aria-hidden="true" />Out of attempts</Badge>
                    )}
                </span>
            </div>
            <h2 className="text-lg font-semibold tracking-tight">{challenge.title}</h2>
            {challenge.description && (
                <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{challenge.description}</p>
            )}
        </div>
    );
}

function ChallengeBody({ challenge, onPassed, onExhausted }) {
    return challenge.type === "quiz"
        ? <QuizChallenge challenge={challenge} onPassed={onPassed} onExhausted={onExhausted} />
        : <CodingChallenge challenge={challenge} onPassed={onPassed} onExhausted={onExhausted} />;
}

// Pass / out-of-attempts state of every challenge of the lesson, shared by the challenges
// embedded in the lesson content (InlineChallenge) and the Practice section at the end.
const ChallengeProgressContext = createContext(null);

export function ChallengeProgressProvider({ challenges = [], onChallengeCompleted, onProgressChange, children }) {
    const items = (challenges || []).filter((c) => c && TYPE_META[c.type]);
    // Only open challenges are required to complete the lesson (same rule as the server).
    const requiredIds = items.filter((c) => c.status === "open").map((c) => c.id);

    const [completed, setCompleted] = useState(() => new Set());
    // All attempts used without a pass: does not block the next lesson any more.
    const [exhausted, setExhausted] = useState(() => new Set());

    const requiredPassed = requiredIds.filter((id) => completed.has(id)).length;
    const requiredResolved = requiredIds.filter((id) => completed.has(id) || exhausted.has(id)).length;

    useEffect(() => {
        onProgressChange?.({ passed: requiredPassed, resolved: requiredResolved, total: requiredIds.length });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requiredPassed, requiredResolved, requiredIds.length]);

    // `initial`: state loaded from an earlier visit only updates the badges; a fresh
    // result also marks the challenge in the URL as the one the learner just worked on.
    const handlePassed = (challengeId, { initial = false } = {}) => {
        setCompleted((prev) => (prev.has(challengeId) ? prev : new Set(prev).add(challengeId)));
        if (!initial) {
            writeHashChallengeId(challengeId);
            onChallengeCompleted?.(challengeId);
        }
    };

    const handleExhausted = (challengeId, { initial = false } = {}) => {
        setExhausted((prev) => (prev.has(challengeId) ? prev : new Set(prev).add(challengeId)));
        if (!initial) writeHashChallengeId(challengeId);
    };

    const value = { items, completed, exhausted, handlePassed, handleExhausted };
    return <ChallengeProgressContext.Provider value={value}>{children}</ChallengeProgressContext.Provider>;
}

function useChallengeProgress() {
    const value = useContext(ChallengeProgressContext);
    if (!value) throw new Error("Challenge components must be rendered inside <ChallengeProgressProvider>");
    return value;
}

// Deep link: scroll to the challenge named in `#challenge-<id>` once it is on the page.
function useScrollToHashChallenge(items, onFound) {
    useEffect(() => {
        const fromHash = readHashChallengeId();
        if (!fromHash || !items.some((c) => String(c.id) === fromHash)) return;

        onFound?.(fromHash);
        const frame = requestAnimationFrame(() => {
            document.getElementById(challengeAnchorId(fromHash))?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return () => cancelAnimationFrame(frame);
        // Only on mount: the lesson view is re-mounted for every lesson.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

// A challenge placed inside the lesson content (Sanity `challengeEmbed` block).
export function InlineChallenge({ publicId, hint }) {
    const { items, completed, exhausted, handlePassed, handleExhausted } = useChallengeProgress();
    const challenge = items.find((c) => c.public_id === publicId);
    useScrollToHashChallenge(challenge ? [challenge] : []);

    // Unpublished / deleted challenge: render nothing rather than a broken card.
    if (!challenge) return null;

    return (
        <aside
            id={challengeAnchorId(challenge.id)}
            className="not-prose my-8 scroll-mt-16 space-y-4 rounded-lg border bg-card p-5 shadow-xs"
            aria-label={`Practice: ${challenge.title}`}
        >
            <ChallengeHeader challenge={challenge} isDone={completed.has(challenge.id)} isExhausted={exhausted.has(challenge.id)} />
            {hint && (
                <details className="group rounded-md border border-dashed px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-medium select-none">Need a hint?</summary>
                    <p className="mt-2 text-muted-foreground">{hint}</p>
                </details>
            )}
            <ChallengeBody challenge={challenge} onPassed={handlePassed} onExhausted={handleExhausted} />
        </aside>
    );
}

// Public ids of the challenges embedded in a lesson's Portable Text content.
export function embeddedChallengeIds(content) {
    return new Set(
        (content || [])
            .filter((block) => block?._type === "challengeEmbed" && block.challengePublicId)
            .map((block) => block.challengePublicId)
    );
}

const NO_EMBEDS = new Set();

// Practice section at the end of the lesson: every challenge not already embedded in the content.
export default function ChallengeSection({ embeddedIds = NO_EMBEDS }) {
    const { items: allItems, completed, exhausted, handlePassed, handleExhausted } = useChallengeProgress();
    const items = allItems.filter((c) => !embeddedIds.has(c.public_id));

    const [activeId, setActiveId] = useState(() => (items[0]?.id != null ? String(items[0].id) : undefined));

    // Deep link: open the tab of, and scroll to, the challenge named in the hash.
    useScrollToHashChallenge(items, setActiveId);

    if (items.length === 0) return null;

    const handleTabChange = (value) => {
        setActiveId(value);
        writeHashChallengeId(value);
    };

    const passedHere = items.filter((c) => completed.has(c.id)).length;

    return (
        <section className="mt-12 space-y-4 border-t pt-8" aria-labelledby="lesson-challenges-heading">
            <div className="flex items-baseline justify-between gap-3">
                <h2 id="lesson-challenges-heading" className="text-sm font-semibold">
                    Practice
                </h2>
                <span className="font-mono text-xs text-muted-foreground tabular">
                    {passedHere}/{items.length} passed
                </span>
            </div>

            {items.length === 1 ? (
                <div id={challengeAnchorId(items[0].id)} className="scroll-mt-16 space-y-4">
                    <ChallengeHeader challenge={items[0]} isDone={completed.has(items[0].id)} isExhausted={exhausted.has(items[0].id)} />
                    <ChallengeBody challenge={items[0]} onPassed={handlePassed} onExhausted={handleExhausted} />
                </div>
            ) : (
                <Tabs value={activeId} onValueChange={handleTabChange} className="gap-4">
                    <TabsList variant="line" className="h-auto w-full justify-start overflow-x-auto overflow-y-hidden border-b pb-2">
                        {items.map((challenge) => {
                            const { Icon } = TYPE_META[challenge.type];
                            const isDone = completed.has(challenge.id);
                            const isOut = exhausted.has(challenge.id);
                            return (
                                <TabsTrigger key={challenge.id} value={String(challenge.id)} className="flex-none px-2.5">
                                    {isDone
                                        ? <LuCheck className="text-success" aria-hidden="true" />
                                        : isOut
                                            ? <LuLock className="text-warning" aria-hidden="true" />
                                            : <Icon aria-hidden="true" />}
                                    <span className="max-w-[16rem] truncate">{challenge.title}</span>
                                    {isDone && <span className="sr-only">(passed)</span>}
                                    {isOut && <span className="sr-only">(out of attempts)</span>}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>

                    {/* Panels stay mounted so answers and editor state survive tab switches. */}
                    {items.map((challenge) => (
                        <TabsContent
                            key={challenge.id}
                            value={String(challenge.id)}
                            forceMount
                            className="data-[state=inactive]:hidden"
                        >
                            <div id={challengeAnchorId(challenge.id)} className="scroll-mt-16 space-y-4">
                                <ChallengeHeader challenge={challenge} isDone={completed.has(challenge.id)} isExhausted={exhausted.has(challenge.id)} />
                                <ChallengeBody challenge={challenge} onPassed={handlePassed} onExhausted={handleExhausted} />
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            )}
        </section>
    );
}
