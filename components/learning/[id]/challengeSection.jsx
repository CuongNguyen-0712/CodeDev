'use client';

import { useState } from "react";

import QuizChallenge from "./challenges/quizChallenge";
import CodingChallenge from "./challenges/codingChallenge";

import { Badge } from "@/components/shadcn/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

import { LuBug, LuCheck, LuCode, LuListChecks } from "react-icons/lu";

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

function challengePoints(challenge) {
    if (challenge.type === "quiz") {
        return (challenge.questions || []).reduce((sum, q) => sum + (Number(q.points) || 0), 0);
    }
    return Number(challenge.points) || 0;
}

function ChallengeHeader({ challenge, isDone }) {
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
                </span>
            </div>
            <h2 className="text-lg font-semibold tracking-tight">{challenge.title}</h2>
            {challenge.description && (
                <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{challenge.description}</p>
            )}
        </div>
    );
}

function ChallengeBody({ challenge, onPassed }) {
    return challenge.type === "quiz"
        ? <QuizChallenge challenge={challenge} onPassed={onPassed} />
        : <CodingChallenge challenge={challenge} onPassed={onPassed} />;
}

export default function ChallengeSection({ challenges = [], onChallengeCompleted }) {
    const items = (challenges || []).filter((c) => c && TYPE_META[c.type]);

    const [activeId, setActiveId] = useState(() => (items[0]?.id != null ? String(items[0].id) : undefined));
    const [completed, setCompleted] = useState(() => new Set());

    if (items.length === 0) return null;

    const handlePassed = (challengeId) => {
        setCompleted((prev) => new Set(prev).add(challengeId));
        onChallengeCompleted?.(challengeId);
    };

    return (
        <section className="mt-12 space-y-4 border-t pt-8" aria-labelledby="lesson-challenges-heading">
            <div className="flex items-baseline justify-between gap-3">
                <h2 id="lesson-challenges-heading" className="text-sm font-semibold">
                    Practice
                </h2>
                <span className="font-mono text-xs text-muted-foreground tabular">
                    {completed.size}/{items.length} passed
                </span>
            </div>

            {items.length === 1 ? (
                <div className="space-y-4">
                    <ChallengeHeader challenge={items[0]} isDone={completed.has(items[0].id)} />
                    <ChallengeBody challenge={items[0]} onPassed={handlePassed} />
                </div>
            ) : (
                <Tabs value={activeId} onValueChange={setActiveId} className="gap-4">
                    <TabsList variant="line" className="h-auto w-full justify-start overflow-x-auto overflow-y-hidden border-b pb-2">
                        {items.map((challenge) => {
                            const { Icon } = TYPE_META[challenge.type];
                            const isDone = completed.has(challenge.id);
                            return (
                                <TabsTrigger key={challenge.id} value={String(challenge.id)} className="flex-none px-2.5">
                                    {isDone
                                        ? <LuCheck className="text-success" aria-hidden="true" />
                                        : <Icon aria-hidden="true" />}
                                    <span className="max-w-[16rem] truncate">{challenge.title}</span>
                                    {isDone && <span className="sr-only">(passed)</span>}
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
                            className="space-y-4 data-[state=inactive]:hidden"
                        >
                            <ChallengeHeader challenge={challenge} isDone={completed.has(challenge.id)} />
                            <ChallengeBody challenge={challenge} onPassed={handlePassed} />
                        </TabsContent>
                    ))}
                </Tabs>
            )}
        </section>
    );
}
