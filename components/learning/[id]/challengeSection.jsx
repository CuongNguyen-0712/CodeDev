'use client';

import { createContext, useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useOpenHint } from "@/mutations/challenge.mutation";
import { userKeys } from "@/keys/user.keys";
import { userQueries } from "@/queries/user.query";
import { hintCost } from "@/lib/challenges/hintCost";
import { EMPTY_PROGRESS, useLessonProgressStore } from "@/stores/lessonProgressStore";

import { Badge } from "@/components/shadcn/badge";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Button } from "@/components/shadcn/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/shadcn/alert-dialog";

import { LuBug, LuCheck, LuCode, LuCoins, LuLightbulb, LuListChecks, LuLoaderCircle, LuLock } from "react-icons/lu";
import QuizText from "./challenges/quizText";

function ChallengeSkeleton() {
    return <Skeleton role="status" aria-label="Loading challenge" className="h-72 w-full rounded-lg" />;
}

// Loaded when a lesson shows a challenge: a lesson with only quizzes never ships the code editor.
const QuizChallenge = dynamic(() => import("./challenges/quizChallenge"), { loading: ChallengeSkeleton });
const CodingChallenge = dynamic(() => import("./challenges/codingChallenge"), { loading: ChallengeSkeleton });

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
        return Number(challenge.quiz_points) || 0;
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
                        <Badge variant="outline" className="tabular">{points} pts</Badge>
                    )}
                    {Number(challenge.exp) > 0 && (
                        <Badge variant="outline" className="tabular text-xp" title="EXP for your first pass">
                            +{challenge.exp} EXP
                        </Badge>
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
                <QuizText text={challenge.description} className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground" />
            )}
        </div>
    );
}

const HINT_LABELS = { 1: "A question to guide you", 2: "Where to look", 3: "A similar example" };

// Static hints, opened one level at a time on the server. Level 3 (a worked example) costs points
// when opened before the first pass (lib/challenges/hintCost, charged once by the server).
// Challenges without hints keep the single Sanity hint.
function ChallengeHints({ challenge, isDone, legacyHint }) {
    const total = Number(challenge.hints_total) || 0;
    const [opened, setOpened] = useState(() => challenge.hints || []);
    const [confirmLevel3, setConfirmLevel3] = useState(false);
    const openHint = useOpenHint();
    const { status } = useSession();
    const { data: me } = useQuery(userQueries.me(status));

    if (total === 0) {
        return legacyHint ? (
            <details className="group rounded-md border border-dashed px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium select-none">Need a hint?</summary>
                <QuizText text={legacyHint} className="mt-2 text-muted-foreground" />
            </details>
        ) : null;
    }

    const next = opened.length + 1;
    const paid = next === 3 && !isDone;
    const cost = hintCost(challenge.points);
    const balance = me ? Number(me.points) || 0 : null;
    const shortBy = paid && balance != null ? Math.max(0, cost - balance) : 0;

    const handleOpen = () => openHint.mutate(
        { challengeId: challenge.id, level: next },
        { onSuccess: (hint) => setOpened((prev) => [...prev.filter((h) => h.level !== hint.level), hint]) }
    );

    return (
        <section aria-label="Hints" className="rounded-lg border bg-muted/30 text-sm">
            <header className="flex items-center gap-2.5 border-b px-4 py-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning" aria-hidden="true">
                    <LuLightbulb className="size-4" />
                </span>
                <h4 className="font-semibold">Hints</h4>
                <span className="ml-auto text-xs text-muted-foreground tabular">{opened.length} of {total} open</span>
            </header>

            {opened.length > 0 && (
                // list-none: the badge carries the number (the lesson's list styles add markers outside the box).
                <ol className="m-0 list-none divide-y p-0">
                    {opened.map((hint) => (
                        <li key={hint.level} className="m-0 grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 px-4 py-3">
                            <span className="mt-px flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink tabular" aria-hidden="true">
                                {hint.level}
                            </span>
                            <div className="min-w-0 space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">
                                    <span className="sr-only">Hint {hint.level}: </span>{HINT_LABELS[hint.level]}
                                </p>
                                <QuizText text={hint.body} className="leading-relaxed" />
                            </div>
                        </li>
                    ))}
                </ol>
            )}

            {next <= total && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3 first:border-t-0">
                    {paid && (
                        <p className="flex min-w-0 flex-1 basis-60 items-start gap-2 text-xs text-muted-foreground">
                            <LuCoins className="mt-px size-3.5 shrink-0 text-xp" aria-hidden="true" />
                            <span>
                                Hint 3 is a worked example and costs <span className="font-medium text-foreground tabular">{cost} points</span> before you pass.
                                {balance != null && <> You have <span className="tabular">{balance.toLocaleString()}</span>.</>}
                            </span>
                        </p>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        onClick={() => (paid ? setConfirmLevel3(true) : handleOpen())}
                        disabled={openHint.isPending || shortBy > 0}
                    >
                        {openHint.isPending ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : paid && <LuCoins className="text-xp" aria-hidden="true" />}
                        {paid ? `Show hint 3 · ${cost} pts` : `Show hint ${next}`}
                    </Button>
                    {shortBy > 0 && (
                        <p className="basis-full text-right text-xs text-muted-foreground">You need {shortBy} more points.</p>
                    )}

                    <AlertDialog open={confirmLevel3} onOpenChange={setConfirmLevel3}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Spend {cost} points on hint 3?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Hint 3 is a worked example of a similar problem. It costs {cost} points now, once; your EXP for this challenge stays the same.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Keep trying</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { setConfirmLevel3(false); handleOpen(); }}>
                                    Spend {cost} points
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}

            {openHint.isError && (
                <p role="alert" className="border-t px-4 py-2.5 text-xs text-destructive">{openHint.error.message}</p>
            )}
        </section>
    );
}

function ChallengeBody({ challenge, onPassed, onExhausted }) {
    return challenge.type === "quiz"
        ? <QuizChallenge challenge={challenge} onPassed={onPassed} onExhausted={onExhausted} />
        : <CodingChallenge challenge={challenge} onPassed={onPassed} onExhausted={onExhausted} />;
}

// The lesson's challenges, for the challenges embedded in the lesson content (InlineChallenge, rendered
// by PortableText without a prop path) and the Practice section. Pass / out-of-attempts state lives in
// stores/lessonProgressStore.js, which lessons.jsx also reads for the "complete lesson" rule.
const LessonChallengesContext = createContext(null);

export function ChallengeProgressProvider({ lessonId, challenges = [], children }) {
    const items = (challenges || []).filter((c) => c && TYPE_META[c.type]);

    // Progress lives as long as the lesson view, as the per-lesson state it replaces did.
    useEffect(() => () => useLessonProgressStore.getState().reset(lessonId), [lessonId]);

    return <LessonChallengesContext.Provider value={{ lessonId, items }}>{children}</LessonChallengesContext.Provider>;
}

function useChallengeProgress() {
    const value = useContext(LessonChallengesContext);
    if (!value) throw new Error("Challenge components must be rendered inside <ChallengeProgressProvider>");
    const { lessonId, items } = value;
    const { completed, exhausted } = useLessonProgressStore((s) => s.byLesson[lessonId] ?? EMPTY_PROGRESS);
    const queryClient = useQueryClient();

    // `initial`: state loaded from an earlier visit only updates the badges; a fresh
    // result also marks the challenge in the URL as the one the learner just worked on.
    const handlePassed = (challengeId, { initial = false } = {}) => {
        useLessonProgressStore.getState().markPassed(lessonId, challengeId);
        if (initial) return;
        writeHashChallengeId(challengeId);
        // The syllabus shows lesson status and unlocks (studyingPage's learningProgress query).
        queryClient.invalidateQueries({ queryKey: [...userKeys.all, "learningProgress"] });
    };

    const handleExhausted = (challengeId, { initial = false } = {}) => {
        useLessonProgressStore.getState().markExhausted(lessonId, challengeId);
        if (!initial) writeHashChallengeId(challengeId);
    };

    return { items, completed, exhausted, handlePassed, handleExhausted };
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
            <ChallengeHints challenge={challenge} isDone={completed.has(challenge.id)} legacyHint={hint} />
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
                <span className="text-xs text-muted-foreground tabular">
                    {passedHere}/{items.length} passed
                </span>
            </div>

            {items.length === 1 ? (
                <div id={challengeAnchorId(items[0].id)} className="scroll-mt-16 space-y-4">
                    <ChallengeHeader challenge={items[0]} isDone={completed.has(items[0].id)} isExhausted={exhausted.has(items[0].id)} />
                    <ChallengeHints challenge={items[0]} isDone={completed.has(items[0].id)} />
                    <ChallengeBody key={items[0].id} challenge={items[0]} onPassed={handlePassed} onExhausted={handleExhausted} />
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
                                <ChallengeHints challenge={challenge} isDone={completed.has(challenge.id)} />
                                <ChallengeBody challenge={challenge} onPassed={handlePassed} onExhausted={handleExhausted} />
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            )}
        </section>
    );
}
