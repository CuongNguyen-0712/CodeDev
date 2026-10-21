'use client';

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useApp } from "@/contexts/appContext";
import { announceRewards } from "@/components/ui/level";
import { useSubmitQuiz } from "@/mutations/challenge.mutation";
import { challengeQueries } from "@/queries/challenge.query";
import { cn } from "@/lib/utils";

import { Button } from "@/components/shadcn/button";
import { Kbd } from "@/components/shadcn/kbd";
import { Progress } from "@/components/shadcn/progress";

import {
    LuArrowLeft,
    LuArrowRight,
    LuCheck,
    LuLightbulb,
    LuListChecks,
    LuClock,
    LuLoaderCircle,
    LuLock,
    LuRotateCcw,
    LuSend,
    LuX,
} from "react-icons/lu";

const SUPPORTED_TYPES = new Set(["single_choice", "multiple_choice"]);
const OPTION_KEYS = "ABCDEFGHI";

// Seconds until `isoTime`, ticking every second (0 when absent or past).
function useCountdown(isoTime) {
    const target = isoTime ? new Date(isoTime).getTime() : 0;
    const compute = () => Math.max(0, Math.ceil((target - Date.now()) / 1000));
    const [seconds, setSeconds] = useState(compute);

    useEffect(() => {
        setSeconds(compute());
        if (!target) return undefined;
        const timer = setInterval(() => {
            const next = compute();
            setSeconds(next);
            if (next === 0) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    return seconds;
}

function formatCountdown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
}

export default function QuizChallenge({ challenge, onPassed, onExhausted }) {
    const { showAlert: alert } = useApp();
    const { status: authStatus } = useSession();
    const submitQuiz = useSubmitQuiz();

    // Attempts, cooldown and whether a new attempt is allowed all come from the server.
    const stateQuery = useQuery({
        ...challengeQueries.quizState(challenge.id),
        enabled: authStatus === "authenticated" && Boolean(challenge.id),
    });
    const state = stateQuery.data;

    // { [questionId]: optionId | optionId[] }
    const [draftAnswers, setAnswers] = useState({});
    const [currentStep, setCurrentStep] = useState(0);
    // True while the learner is answering a new attempt after a failed one.
    const [retaking, setRetaking] = useState(false);
    const secondsLeft = useCountdown(state?.nextAttemptAt);

    const questions = (challenge.questions || []).filter((q) => SUPPORTED_TYPES.has(q.type));
    const isSubmitted = Boolean(state?.attempted) && !retaking;
    const result = isSubmitted ? state : null;
    const answers = result?.answers || draftAnswers;
    const isPassed = Boolean(state?.passed);
    const attemptsLeft = Number(state?.attemptsLeft ?? 0);
    const isSubmitting = submitQuiz.isPending;
    const isLoadingState = stateQuery.isLoading;

    // When the cooldown ends, ask the server whether the next attempt is open.
    useEffect(() => {
        if (state?.nextAttemptAt && secondsLeft === 0) stateQuery.refetch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [secondsLeft === 0, state?.nextAttemptAt]);

    useEffect(() => {
        if (isPassed && !submitQuiz.isSuccess) onPassed?.(challenge.id, { initial: true });
        // Report a previous pass once when the attempt loads.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPassed, challenge.id]);

    // Every attempt used without a pass: the lesson can move on without this quiz.
    const isExhausted = Boolean(state?.attempted) && !isPassed && attemptsLeft === 0;
    useEffect(() => {
        if (isExhausted) onExhausted?.(challenge.id, { initial: !submitQuiz.isSuccess });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isExhausted, challenge.id]);

    if (questions.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
                <LuListChecks className="size-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">No questions yet</p>
                <p className="text-sm text-muted-foreground">This knowledge check has no questions configured.</p>
            </div>
        );
    }

    const currentQuestion = questions[Math.min(currentStep, questions.length - 1)];
    const isMultiple = currentQuestion?.type === "multiple_choice";

    const isAnswered = (question) => {
        const val = answers[question.id];
        return Array.isArray(val) ? val.length > 0 : val !== undefined && val !== null;
    };

    const answeredCount = questions.filter(isAnswered).length;
    const canSubmit = answeredCount === questions.length;

    const handleSelectOption = (question, optionId) => {
        if (isSubmitted || isSubmitting || isLoadingState) return;

        setAnswers((prev) => {
            if (question.type !== "multiple_choice") {
                return { ...prev, [question.id]: optionId };
            }
            const current = Array.isArray(prev[question.id]) ? prev[question.id] : [];
            const updated = current.includes(optionId)
                ? current.filter((id) => id !== optionId)
                : [...current, optionId];
            return { ...prev, [question.id]: updated };
        });
    };

    // Ids may come back from the server as strings: compare as strings.
    const isOptionSelected = (question, optionId) => {
        const selected = answers[question.id];
        return question.type === "multiple_choice"
            ? Array.isArray(selected) && selected.map(String).includes(String(optionId))
            : selected !== undefined && selected !== null && String(selected) === String(optionId);
    };

    const handleNext = () => {
        if (currentStep < questions.length - 1) {
            setCurrentStep((prev) => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep((prev) => prev - 1);
        }
    };

    const handleSubmit = async () => {
        if (!canSubmit || isSubmitting) return;

        try {
            const res = await submitQuiz.mutateAsync({ challengeId: challenge.id, answers: draftAnswers });
            setCurrentStep(0);
            setRetaking(false);
            setAnswers({});

            if (res.passed) {
                announceRewards(res, {
                    title: `Challenge passed: ${res.earnedPoints}/${res.totalPoints} points`,
                    id: `challenge-passed:${challenge.id}`,
                });
                onPassed?.(challenge.id);
            } else if (res.attemptsLeft > 0) {
                alert(400, `You scored ${res.earnedPoints}/${res.totalPoints}. ${res.attemptsLeft} attempt(s) left, the next one opens in ${Math.round(res.cooldownSeconds / 60)} minutes.`);
            } else {
                alert(400, `You scored ${res.earnedPoints}/${res.totalPoints}. You have used all ${res.maxAttempts} attempts.`);
            }
        } catch (error) {
            setRetaking(false);
            alert(error.status || 500, error.message || "Failed to submit challenge. Please try again.");
        }
    };

    const handleRetake = () => {
        if (!state?.canSubmit) return;
        setAnswers({});
        setCurrentStep(0);
        setRetaking(true);
    };

    // Number keys pick an option while focus is inside the question.
    const handleOptionKeys = (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const index = Number(event.key) - 1;
        const option = currentQuestion.options?.[index];
        if (Number.isInteger(index) && option) {
            event.preventDefault();
            handleSelectOption(currentQuestion, option.id);
        }
    };

    const isCurrentAnswered = isAnswered(currentQuestion);
    const qResult = result?.results?.[String(currentQuestion.id)];
    const correctOptions = (qResult?.correctOptionIds || []).map(String);
    const progressPercent = Math.round((answeredCount / questions.length) * 100);
    // Explanations and correct options are only sent by the server once the quiz is passed.
    const explanation = qResult?.explanation;

    return (
        <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/50 px-4 py-2.5">
                <span className="text-xs text-muted-foreground tabular">
                    Question {currentStep + 1} of {questions.length}
                </span>
                {questions.length > 1 && <nav aria-label="Questions" className="flex flex-wrap gap-1">
                    {questions.map((q, idx) => {
                        const isCurrent = idx === currentStep;
                        const graded = result?.results?.[String(q.id)];
                        return (
                            <button
                                key={q.id}
                                type="button"
                                onClick={() => setCurrentStep(idx)}
                                aria-label={`Question ${idx + 1}${graded ? (graded.isCorrect ? ', correct' : ', incorrect') : isAnswered(q) ? ', answered' : ''}`}
                                aria-current={isCurrent ? 'step' : undefined}
                                className={cn(
                                    'flex size-6 items-center justify-center rounded-sm border text-[11px] tabular transition-colors',
                                    isCurrent
                                        ? 'border-primary bg-primary text-primary-foreground dark:text-white'
                                        : graded
                                            ? graded.isCorrect
                                                ? 'border-success/40 bg-success-soft text-success'
                                                : 'border-destructive/40 bg-destructive-soft text-destructive'
                                            : isAnswered(q)
                                                ? 'border-primary/30 bg-primary-soft text-primary-soft-foreground'
                                                : 'bg-background text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {idx + 1}
                            </button>
                        );
                    })}
                </nav>}
                <span className="ml-auto text-xs text-muted-foreground tabular">
                    {currentQuestion.points ?? 10} pts
                </span>
            </div>
            <Progress value={progressPercent} className="h-0.5 rounded-none bg-transparent" aria-label="Questions answered" />

            <div className="space-y-4 p-4 sm:p-5">
                <div className="space-y-1">
                    <h3 className="text-base leading-snug font-medium text-foreground">{currentQuestion.content}</h3>
                    <p className="text-xs text-muted-foreground">
                        {isMultiple ? 'Select all answers that apply.' : 'Select one answer.'}
                    </p>
                </div>

                <div
                    className="grid gap-2"
                    role={isMultiple ? "group" : "radiogroup"}
                    aria-label={`Question ${currentStep + 1} options`}
                    onKeyDown={handleOptionKeys}
                >
                    {(currentQuestion.options || []).map((option, optIdx) => {
                        const selected = isOptionSelected(currentQuestion, option.id);
                        const wasCorrect = correctOptions.includes(String(option.id));
                        // Passed: every correct option is highlighted. Not passed: only the
                        // learner's own choices are marked right or wrong (answers stay hidden).
                        const outcome = !isSubmitted ? null
                            : isPassed
                                ? (selected && wasCorrect ? 'correct' : selected ? 'incorrect' : wasCorrect ? 'missed' : null)
                                : (selected ? (qResult?.isCorrect ? 'correct' : 'incorrect') : null);

                        return (
                            <button
                                key={option.id}
                                type="button"
                                role={isMultiple ? "checkbox" : "radio"}
                                aria-checked={selected}
                                onClick={() => handleSelectOption(currentQuestion, option.id)}
                                disabled={isSubmitted || isSubmitting || isLoadingState}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-md border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/40 disabled:cursor-default',
                                    selected && !isSubmitted && 'border-primary bg-primary-soft/60',
                                    outcome === 'correct' && 'border-success/50 bg-success-soft',
                                    outcome === 'incorrect' && 'border-destructive/50 bg-destructive-soft',
                                    outcome === 'missed' && 'border-success/60 bg-success-soft/60',
                                    isSubmitted && !outcome && 'opacity-70 hover:border-border hover:bg-background'
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'flex size-5 shrink-0 items-center justify-center border text-[10px] font-medium',
                                        isMultiple ? 'rounded-sm' : 'rounded-full',
                                        selected ? 'border-primary bg-primary text-primary-foreground dark:text-white' : 'border-input bg-background text-muted-foreground',
                                        outcome === 'correct' && 'border-success bg-success text-success-foreground',
                                        outcome === 'incorrect' && 'border-destructive bg-destructive text-destructive-foreground'
                                    )}
                                >
                                    {outcome === 'incorrect' ? <LuX className="size-3" />
                                        : selected || outcome === 'missed' ? <LuCheck className="size-3" />
                                            : OPTION_KEYS[optIdx]}
                                </span>
                                <span className="min-w-0 flex-1">{option.content}</span>
                                {outcome === 'correct' && <span className="text-xs font-medium text-success">Correct</span>}
                                {outcome === 'incorrect' && <span className="text-xs font-medium text-destructive">Incorrect</span>}
                                {outcome === 'missed' && <span className="text-xs font-medium text-success">Correct answer</span>}
                                {!isSubmitted && optIdx < 9 && (
                                    <Kbd className="max-sm:hidden" aria-hidden="true">{optIdx + 1}</Kbd>
                                )}
                            </button>
                        );
                    })}
                </div>

                {isSubmitted && explanation && (
                    <div className="flex gap-2.5 rounded-md border bg-muted/60 p-3 text-sm">
                        <LuLightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                        <div className="space-y-0.5">
                            <p className="font-medium">Explanation</p>
                            <p className="text-muted-foreground">{explanation}</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
                <Button variant="ghost" size="sm" onClick={handleBack} disabled={currentStep === 0 || isSubmitting}>
                    <LuArrowLeft />
                    Back
                </Button>

                <div className="flex items-center gap-3">
                    {!isSubmitted && (
                        <span className="text-xs text-muted-foreground tabular max-sm:hidden">
                            {answeredCount}/{questions.length} answered · attempt {(state?.attemptsUsed ?? 0) + 1} of {state?.maxAttempts ?? 3}
                        </span>
                    )}
                    {isSubmitted ? (
                        <>
                            <span
                                role="status"
                                aria-live="polite"
                                className={cn(
                                    'flex items-center gap-1.5 text-xs font-medium tabular',
                                    isPassed ? 'text-success' : 'text-muted-foreground'
                                )}
                            >
                                {isPassed ? <LuCheck className="size-3.5" aria-hidden="true" />
                                    : attemptsLeft > 0 ? <LuClock className="size-3.5" aria-hidden="true" />
                                        : <LuLock className="size-3.5" aria-hidden="true" />}
                                {isPassed
                                    ? `Passed ${result.earnedPoints}/${result.totalPoints}`
                                    : attemptsLeft === 0
                                        ? `${result.earnedPoints}/${result.totalPoints} · no attempts left`
                                        : secondsLeft > 0
                                            ? `${result.earnedPoints}/${result.totalPoints} · next attempt in ${formatCountdown(secondsLeft)}`
                                            : `${result.earnedPoints}/${result.totalPoints} · ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left`}
                            </span>
                            {currentStep < questions.length - 1 && (
                                <Button variant="ghost" size="sm" onClick={handleNext}>
                                    Next question
                                    <LuArrowRight />
                                </Button>
                            )}
                            {/* No retry button once passed or out of attempts. */}
                            {!isPassed && attemptsLeft > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRetake}
                                    disabled={!state?.canSubmit || secondsLeft > 0 || stateQuery.isFetching}
                                >
                                    <LuRotateCcw />
                                    Try again
                                </Button>
                            )}
                        </>
                    ) : currentStep < questions.length - 1 ? (
                        <Button size="sm" onClick={handleNext} disabled={!isCurrentAnswered}>
                            Continue
                            <LuArrowRight />
                        </Button>
                    ) : state?.canSubmit === false ? null : (
                        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || isSubmitting || isLoadingState}>
                            {isSubmitting ? <LuLoaderCircle className="animate-spin" /> : <LuSend />}
                            {isSubmitting ? 'Submitting...' : 'Submit answers'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
