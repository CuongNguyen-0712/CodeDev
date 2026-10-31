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
        // A new target re-syncs right away (from a callback, not synchronously in the effect), then every second.
        let timer = null;
        const tick = () => {
            const next = compute();
            setSeconds(next);
            if (next === 0) clearInterval(timer);
        };
        const first = setTimeout(tick, 0);
        if (target) timer = setInterval(tick, 1000);
        return () => {
            clearTimeout(first);
            clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);

    return seconds;
}

function formatCountdown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
}

const secondsFromNow = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

// "1 minute", "90 seconds": the wait a fresh attempt starts.
function formatWait(seconds) {
    if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
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
    // Why the last submit failed: { status, message, retryAt?, missingQuestionIds? }. The draft stays.
    const [submitError, setSubmitError] = useState(null);
    const secondsLeft = useCountdown(state?.nextAttemptAt);
    const retrySecondsLeft = useCountdown(submitError?.retryAt);

    const questions = (challenge.questions || []).filter((q) => SUPPORTED_TYPES.has(q.type));
    // A retake ends by itself once the quiz is passed or out of attempts (e.g. from another tab).
    const isRetaking = retaking && !state?.passed && Number(state?.attemptsLeft ?? 1) > 0;
    const isSubmitted = Boolean(state?.attempted) && !isRetaking;
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
    // Questions the server reported unanswered, while they still are.
    const missingIds = new Set((submitError?.missingQuestionIds || []).map(String));
    const isMissing = (question) => missingIds.has(String(question.id)) && !isAnswered(question);
    // Cooling down (from the server state or the last 429): the submit button waits.
    const waitSeconds = Math.max(retrySecondsLeft, state?.canSubmit === false ? secondsLeft : 0);

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
        if (!canSubmit || isSubmitting || waitSeconds > 0) return;
        const attemptsBefore = Number(state?.attemptsUsed ?? 0);

        try {
            const res = await submitQuiz.mutateAsync({ challengeId: challenge.id, answers: draftAnswers });
            setCurrentStep(0);
            setRetaking(false);
            setSubmitError(null);
            setAnswers({});

            if (res.passed) {
                announceRewards(res, {
                    title: `Challenge passed: ${res.earnedPoints}/${res.totalPoints} points`,
                    id: `challenge-passed:${challenge.id}`,
                });
                onPassed?.(challenge.id);
            } else if (res.attemptsLeft > 0) {
                alert(400, `You scored ${res.earnedPoints}/${res.totalPoints}. ${res.attemptsLeft} attempt(s) left, the next one opens in ${formatWait(res.cooldownSeconds)}.`);
            } else {
                alert(400, `You scored ${res.earnedPoints}/${res.totalPoints}. You have used all ${res.maxAttempts} attempts.`);
            }
        } catch (error) {
            const status = error.status || 500;
            const message = error.message || "Failed to submit challenge. Please try again.";

            // Already passed or out of attempts: nothing left to answer, show the saved result.
            if (status === 409) {
                setRetaking(false);
                setSubmitError(null);
                alert(status, message);
                return;
            }

            // A 5xx or a lost connection may still have saved the attempt: if the server now
            // counts one more, show that result instead of the draft.
            if (status >= 500) {
                const fresh = await stateQuery.refetch();
                if (Number(fresh.data?.attemptsUsed ?? 0) > attemptsBefore) {
                    setRetaking(false);
                    setSubmitError(null);
                    setAnswers({});
                    setCurrentStep(0);
                    return;
                }
            }

            // Otherwise keep the answers and say why, next to the submit button.
            const missingQuestionIds = (error.details?.missingQuestionIds || []).map(String);
            setSubmitError({
                status,
                message,
                retryAt: error.retryAfter ? secondsFromNow(error.retryAfter) : null,
                missingQuestionIds,
            });
            const firstMissing = questions.findIndex((q) => missingQuestionIds.includes(String(q.id)));
            if (firstMissing >= 0) setCurrentStep(firstMissing);
        }
    };

    const handleRetake = () => {
        if (!state?.canSubmit) return;
        setAnswers({});
        setSubmitError(null);
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
                                aria-label={`Question ${idx + 1}${graded ? (graded.isCorrect ? ', correct' : ', incorrect') : isAnswered(q) ? ', answered' : isMissing(q) ? ', not answered' : ''}`}
                                aria-current={isCurrent ? 'step' : undefined}
                                className={cn(
                                    'flex size-6 items-center justify-center rounded-sm border text-xs tabular transition-colors',
                                    isCurrent
                                        ? 'border-primary bg-primary text-primary-foreground dark:text-white'
                                        : graded
                                            ? graded.isCorrect
                                                ? 'border-success/40 bg-success-soft text-success'
                                                : 'border-destructive/40 bg-destructive-soft text-destructive'
                                            : isAnswered(q)
                                                ? 'border-primary/30 bg-primary-soft text-primary-soft-foreground'
                                                : isMissing(q)
                                                    ? 'border-destructive/60 bg-background text-destructive'
                                                    : 'bg-background text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {idx + 1}
                            </button>
                        );
                    })}
                </nav>}
                <span className="ml-auto text-xs text-muted-foreground tabular">
                    {Number(currentQuestion.points) || 0} pts
                </span>
            </div>
            <Progress value={progressPercent} className="h-0.5 rounded-none bg-transparent" aria-label="Questions answered" />

            <div className="space-y-4 p-4 sm:p-5">
                <div className="space-y-1">
                    <h3 className="text-base leading-snug font-medium text-foreground">{currentQuestion.content}</h3>
                    <p className="text-xs text-muted-foreground">
                        {isMultiple ? 'Select all answers that apply.' : 'Select one answer.'}
                    </p>
                    {/* Before a pass the server grades whole questions, never single options. */}
                    {isSubmitted && !isPassed && qResult && (
                        <p className={cn('flex items-center gap-1.5 text-xs font-medium', qResult.isCorrect ? 'text-success' : 'text-destructive')}>
                            {qResult.isCorrect ? <LuCheck className="size-3.5" aria-hidden="true" /> : <LuX className="size-3.5" aria-hidden="true" />}
                            {qResult.isCorrect ? 'Your answer is correct' : 'Your answer is not correct yet'}
                        </p>
                    )}
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
                        // Passed: every option is marked against the answer key. Not passed: the
                        // verdict is per question (above), so a correct pick is never marked wrong.
                        const outcome = isSubmitted && isPassed
                            ? (selected && wasCorrect ? 'correct' : selected ? 'incorrect' : wasCorrect ? 'missed' : null)
                            : null;

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
                                    selected && !outcome && 'border-primary bg-primary-soft/60',
                                    outcome === 'correct' && 'border-success/50 bg-success-soft',
                                    outcome === 'incorrect' && 'border-destructive/50 bg-destructive-soft',
                                    outcome === 'missed' && 'border-success/60 bg-success-soft/60',
                                    isSubmitted && !outcome && !selected && 'opacity-70 hover:border-border hover:bg-background'
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'flex size-5 shrink-0 items-center justify-center border text-xs font-medium',
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

            {submitError && !isSubmitted && (
                <p role="alert" className="flex items-start gap-2 border-t bg-destructive-soft/40 px-4 py-2.5 text-sm text-destructive">
                    <LuX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                        {retrySecondsLeft > 0
                            ? `Your answers are kept. You can submit again in ${formatCountdown(retrySecondsLeft)}.`
                            : submitError.retryAt
                                ? 'Your answers are kept. You can submit again now.'
                                : submitError.message}
                    </span>
                </p>
            )}

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
                    ) : (
                        <>
                            {/* A background refresh never hides the button while answering: it says why it waits. */}
                            {waitSeconds > 0 && !submitError && (
                                <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground tabular">
                                    <LuClock className="size-3.5" aria-hidden="true" />
                                    Opens in {formatCountdown(waitSeconds)}
                                </span>
                            )}
                            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || isSubmitting || isLoadingState || waitSeconds > 0}>
                                {isSubmitting ? <LuLoaderCircle className="animate-spin" /> : <LuSend />}
                                {isSubmitting ? 'Submitting...' : 'Submit answers'}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
