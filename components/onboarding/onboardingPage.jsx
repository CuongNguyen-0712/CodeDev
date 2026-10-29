'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { cn } from "@/lib/utils";
import { onboardingQueries } from "@/queries/premium.query";
import { useCompleteOnboarding, useSaveOnboardingStep, useSkipOnboarding } from "@/mutations/premium.mutation";

import { ErrorReload } from "@/components/ui/error";
import { LogoMark } from "@/components/ui/logo";
import { ChoiceCheckboxGroup, ChoiceRadioGroup, levelHint, levelLabel } from "@/components/onboarding/choiceFields";
import { RecommendationCard, RecommendationCardSkeleton } from "@/components/onboarding/recommendationCard";

import { Button } from "@/components/shadcn/button";
import { FieldLegend, FieldSet } from "@/components/shadcn/field";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";

import {
    LuArrowLeft,
    LuArrowRight,
    LuCheck,
    LuCircleAlert,
    LuLayoutDashboard,
    LuLibrary,
    LuPencil,
    LuUser,
} from "react-icons/lu";

// One question per slide. `step` is the server's onboarding step the answer belongs to: level, goals
// and language are separate slides but one saved step (level_goals), so resuming and the API stay as
// they were.
const SLIDES = [
    { key: "role", step: "role", label: "Role" },
    { key: "industry", step: "industry", label: "Industry" },
    { key: "level", step: "level_goals", label: "Level" },
    { key: "goals", step: "level_goals", label: "Goals" },
    { key: "language", step: "level_goals", label: "Language" },
    { key: "review", step: "review", label: "Review" },
];
const SLIDE_KEYS = SLIDES.map((slide) => slide.key);
const NO_LANGUAGE = "none";

function initialSlide(state) {
    if (state?.status === "completed") return "recommendations";
    const current = state?.currentStep;
    if (current === "recommendations") return "review";
    // A saved step resumes on its first slide.
    return SLIDES.find((slide) => slide.step === current)?.key || "role";
}

function initialDraft(preferences, catalog) {
    const roles = new Set((catalog?.roles || []).map((role) => role.code));
    const industries = new Set((catalog?.industries || []).map((item) => item.code));
    const goals = new Set((catalog?.goals || []).map((goal) => goal.code));
    const levels = catalog?.levels || [];
    const languages = new Set((catalog?.languages || []).map((lang) => lang.id));

    return {
        roleCode: roles.has(preferences?.roleCode) ? preferences.roleCode : null,
        industryCodes: (preferences?.industryCodes || []).filter((code) => industries.has(code)),
        experienceLevel: levels.includes(preferences?.experienceLevel) ? preferences.experienceLevel : null,
        goalCodes: (preferences?.goalCodes || []).filter((code) => goals.has(code)),
        preferredLanguageId: languages.has(preferences?.preferredLanguageId) ? preferences.preferredLanguageId : null,
    };
}

function slideProblems(slide, draft) {
    const problems = [];
    if ((slide === "role" || slide === "review") && !draft.roleCode) problems.push("Choose a role to continue.");
    if ((slide === "level" || slide === "language" || slide === "review") && !draft.experienceLevel) problems.push("Choose your experience level.");
    if ((slide === "goals" || slide === "language" || slide === "review") && draft.goalCodes.length === 0) problems.push("Choose at least one goal.");
    return problems;
}

function stepPayload(step, draft) {
    if (step === "role") return { step, roleCode: draft.roleCode };
    if (step === "industry") return { step, industryCodes: draft.industryCodes };
    return {
        step,
        experienceLevel: draft.experienceLevel,
        goalCodes: draft.goalCodes,
        preferredLanguageId: draft.preferredLanguageId ?? null,
    };
}

function StepHeading({ id, headingRef, title, description }) {
    return (
        <div className="space-y-1">
            <h2
                id={id}
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-semibold tracking-tight text-foreground outline-none sm:text-2xl"
            >
                {title}
            </h2>
            {description && <p className="max-w-[60ch] text-sm text-muted-foreground">{description}</p>}
        </div>
    );
}

function ValidationHint({ id, problems, show }) {
    return (
        <div id={id} aria-live="polite" className="[&:has(li)]:mb-2.5">
            {show && problems.length > 0 && (
                <ul className="m-0 list-none space-y-0.5 p-0 text-sm text-muted-foreground">
                    {problems.map((problem) => (
                        <li key={problem} className="flex items-center gap-1.5">
                            <LuCircleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                            {problem}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// One segment per slide: answered slides fill with the brand hue, the current one is half-filled.
function ProgressHeader({ slide }) {
    const index = SLIDE_KEYS.indexOf(slide);
    const done = slide === "recommendations";

    return (
        <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
                <p className="font-medium text-foreground tabular" aria-live="polite">
                    {done ? "All set" : `Question ${index + 1} of ${SLIDES.length}`}
                </p>
                {!done && <p className="text-muted-foreground">{SLIDES[index].label}</p>}
            </div>
            <ol className="m-0 grid list-none gap-1.5 p-0" style={{ gridTemplateColumns: `repeat(${SLIDES.length}, minmax(0, 1fr))` }} aria-label="Onboarding questions">
                {SLIDES.map((item, itemIndex) => {
                    const state = done || itemIndex < index ? "done" : itemIndex === index ? "current" : "todo";
                    return (
                        <li key={item.key} aria-current={state === "current" ? "step" : undefined} className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <span
                                className={cn(
                                    "block h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none",
                                    state === "todo" ? "w-0" : "w-full"
                                )}
                            />
                            <span className="sr-only">
                                {item.label}{state === "done" ? " (answered)" : state === "current" ? " (current)" : ""}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

function ReviewRow({ label, value, onEdit, disabled }) {
    return (
        // A <dl> row may only hold <dt>/<dd>, so the Edit button sits in its own <dd> beside the value.
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="col-start-1 m-0 min-w-0 text-sm text-foreground">{value}</dd>
            <dd className="col-start-2 row-span-2 row-start-1 m-0">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onEdit}
                    disabled={disabled}
                    aria-label={`Edit ${label.toLowerCase()}`}
                >
                    <LuPencil />
                    Edit
                </Button>
            </dd>
        </div>
    );
}

function RecommendationsStep({ sessionStatus, headingRef, onEdit }) {
    const { data, isLoading, isError, error, refetch } = useQuery(onboardingQueries.recommendations(sessionStatus, 6));
    const items = Array.isArray(data?.items) ? data.items : [];
    const pending = sessionStatus === "loading" || isLoading;

    return (
        <section aria-labelledby="onboarding-recommendations-heading" className="flex flex-col gap-5">
            <StepHeading
                id="onboarding-recommendations-heading"
                headingRef={headingRef}
                title="Your recommended courses"
                description="Picked from your role, experience level and goals. You can change your answers any time in Settings."
            />

            {!pending && !isError && data?.fallback && items.length > 0 && (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    We could not match your profile yet; these are popular courses.
                </p>
            )}

            {pending ? (
                <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true" aria-label="Loading recommendations">
                    {Array.from({ length: 3 }, (_, index) => (
                        <li key={index}><RecommendationCardSkeleton /></li>
                    ))}
                </ul>
            ) : isError ? (
                <ErrorReload data={error} refetch={refetch} title="Could not load your recommendations" />
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
                    <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <LuLibrary className="size-5" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">No recommendations yet</h3>
                        <p className="max-w-[48ch] text-sm text-muted-foreground">
                            There are no courses to suggest right now. Browse the catalog to find something to start with.
                        </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                        <Link href="/course">Browse courses</Link>
                    </Button>
                </div>
            ) : (
                <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3" aria-label="Recommended courses">
                    {items.map((item, index) => (
                        <li key={item?.course?.id || index}>
                            <RecommendationCard item={item} />
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" onClick={onEdit}>
                    <LuPencil />
                    Edit my answers
                </Button>
                <Button asChild>
                    <Link href="/home">
                        <LuLayoutDashboard />
                        Go to dashboard
                    </Link>
                </Button>
            </div>
        </section>
    );
}

function OnboardingWizard({ catalog, state, sessionStatus }) {
    const router = useRouter();
    const { showAlert } = useApp();

    const [slide, setSlide] = useState(() => initialSlide(state));
    // Which way the last move went, so the next question slides in from the matching side.
    const [direction, setDirection] = useState("forward");
    const [draft, setDraft] = useState(() => initialDraft(state?.preferences, catalog));
    const [returnToReview, setReturnToReview] = useState(false);
    const [error, setError] = useState(null);

    const saveStep = useSaveOnboardingStep();
    const complete = useCompleteOnboarding();
    const skip = useSkipOnboarding();
    const busy = saveStep.isPending || complete.isPending || skip.isPending;

    const headingRef = useRef(null);
    const previousSlide = useRef(slide);

    // Move focus to the new question so keyboard and screen reader users land on it.
    useEffect(() => {
        if (previousSlide.current === slide) return;
        previousSlide.current = slide;
        headingRef.current?.focus();
    }, [slide]);

    const options = useMemo(() => ({
        roles: (catalog?.roles || []).map((role) => ({ value: role.code, label: role.name, description: role.description })),
        industries: (catalog?.industries || []).map((item) => ({ value: item.code, label: item.name })),
        goals: (catalog?.goals || []).map((goal) => ({ value: goal.code, label: goal.name })),
        levels: (catalog?.levels || []).map((level) => ({ value: level, label: levelLabel(level), description: levelHint(level) })),
        languages: [
            { value: NO_LANGUAGE, label: "No preference", description: "Courses in every language" },
            ...(catalog?.languages || []).map((lang) => ({ value: String(lang.id), label: lang.name })),
        ],
    }), [catalog]);

    const names = useMemo(() => ({
        role: new Map((catalog?.roles || []).map((role) => [role.code, role.name])),
        industry: new Map((catalog?.industries || []).map((item) => [item.code, item.name])),
        goal: new Map((catalog?.goals || []).map((goal) => [goal.code, goal.name])),
        language: new Map((catalog?.languages || []).map((lang) => [lang.id, lang.name])),
    }), [catalog]);

    const update = (patch) => {
        setDraft((current) => ({ ...current, ...patch }));
        setError(null);
    };

    const goTo = (next, way = "forward") => {
        setError(null);
        setDirection(way);
        setSlide(next);
    };

    const problems = slideProblems(slide, draft);
    const isValid = problems.length === 0;
    const slideIndex = SLIDE_KEYS.indexOf(slide);
    const current = SLIDES[slideIndex];
    const isCompleted = state?.status === "completed";

    const reportError = (err, fallback) => {
        const message = err?.message || fallback;
        setError(message);
        showAlert(err?.status || 500, message);
    };

    // Level and goals are saved together with the language (one server step), on the language slide,
    // or straight away when they were edited from the review.
    const savesOnLeave = (key) =>
        key === "role" || key === "industry" || key === "language" || (returnToReview && (key === "level" || key === "goals"));

    const handleNext = async () => {
        if (!isValid || busy) return;
        setError(null);

        if (slide === "review") {
            try {
                await complete.mutateAsync();
                setReturnToReview(false);
                goTo("recommendations");
            } catch (err) {
                reportError(err, "Could not finish onboarding. Please try again.");
            }
            return;
        }

        if (savesOnLeave(slide)) {
            // level_goals needs a level and a goal; editing only the level from the review has both.
            if (current.step === "level_goals" && slideProblems("language", draft).length > 0) {
                goTo(SLIDE_KEYS[slideIndex + 1]);
                return;
            }
            try {
                await saveStep.mutateAsync(stepPayload(current.step, draft));
            } catch (err) {
                // The answers stay in the draft so the learner can retry without choosing again.
                reportError(err, "Could not save your answers. Please try again.");
                return;
            }
        }

        if (returnToReview) {
            setReturnToReview(false);
            goTo("review");
        } else {
            goTo(SLIDE_KEYS[slideIndex + 1]);
        }
    };

    const handleBack = () => {
        if (slideIndex <= 0 || busy) return;
        setReturnToReview(false);
        goTo(SLIDE_KEYS[slideIndex - 1], "back");
    };

    const handleEdit = (target) => {
        setReturnToReview(true);
        goTo(target, "back");
    };

    const handleSkip = async () => {
        if (busy) return;
        try {
            await skip.mutateAsync();
            router.replace("/home");
        } catch (err) {
            reportError(err, "Could not skip onboarding. Please try again.");
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleNext();
    };

    const hintId = "onboarding-step-hint";
    const errorId = "onboarding-step-error";
    const nextLabel = slide === "review"
        ? (complete.isPending ? "Finishing..." : "Finish")
        : saveStep.isPending
            ? "Saving..."
            : returnToReview
                ? "Save and return to review"
                : slide === "industry" && draft.industryCodes.length === 0
                    ? "Skip this question"
                    : "Continue";

    const languageValue = draft.preferredLanguageId != null ? String(draft.preferredLanguageId) : NO_LANGUAGE;

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-20 sm:px-6 sm:pb-12 lg:pt-10">
            <header className="flex items-center justify-between gap-3">
                {/* Not a link: /home sends unfinished onboarding straight back here. */}
                <span className="flex items-center gap-2">
                    <LogoMark size={28} aria-hidden="true" />
                    <span className="sr-only">CodeDev</span>
                </span>
                {!isCompleted && slide !== "recommendations" && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleSkip} disabled={busy}>
                        {skip.isPending && <Spinner aria-hidden="true" />}
                        {skip.isPending ? "Skipping..." : "Skip for now"}
                    </Button>
                )}
            </header>

            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {slide === "recommendations" ? "You are all set" : "Set up your learning profile"}
                </h1>
                <p className="max-w-[60ch] text-sm text-muted-foreground">
                    {slide === "recommendations"
                        ? "Here is where we suggest you start."
                        : "Six short questions so we can recommend the right courses. You can change your answers later in Settings."}
                </p>
            </div>

            <ProgressHeader slide={slide} />

            {slide === "recommendations" ? (
                <RecommendationsStep
                    sessionStatus={sessionStatus}
                    headingRef={headingRef}
                    onEdit={() => goTo("review", "back")}
                />
            ) : (
                <form onSubmit={handleSubmit} noValidate className="flex flex-col rounded-lg border bg-card sm:h-[clamp(26rem,calc(100dvh-17rem),40rem)]">
                    {/* One question at a time; keyed by slide so each enters with a short slide from its side. */}
                    <div
                        key={slide}
                        className={cn(
                            "flex min-h-0 flex-1 flex-col gap-5 p-4 animate-in fade-in duration-200 ease-out motion-reduce:animate-none sm:overflow-y-auto sm:p-6",
                            direction === "forward" ? "slide-in-from-right-6" : "slide-in-from-left-6"
                        )}
                    >
                        {slide === "role" && (
                            <>
                                <StepHeading
                                    headingRef={headingRef}
                                    title="What role are you aiming for?"
                                    description="We suggest courses that build the skills this role needs."
                                />
                                <FieldSet disabled={busy}>
                                    <FieldLegend className="sr-only">Choose one role</FieldLegend>
                                    {options.roles.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No roles are available yet. You can skip this question.</p>
                                    ) : (
                                        <ChoiceRadioGroup
                                            idPrefix="onboarding-role"
                                            options={options.roles}
                                            value={draft.roleCode}
                                            onChange={(value) => update({ roleCode: value })}
                                            disabled={busy}
                                            describedBy={hintId}
                                        />
                                    )}
                                </FieldSet>
                            </>
                        )}

                        {slide === "industry" && (
                            <>
                                <StepHeading
                                    headingRef={headingRef}
                                    title="Which industries interest you?"
                                    description="Optional. Pick any that apply, or skip this question."
                                />
                                <FieldSet disabled={busy}>
                                    <FieldLegend className="sr-only">Industries (optional)</FieldLegend>
                                    {options.industries.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No industries are available yet.</p>
                                    ) : (
                                        <ChoiceCheckboxGroup
                                            idPrefix="onboarding-industry"
                                            options={options.industries}
                                            values={draft.industryCodes}
                                            onChange={(values) => update({ industryCodes: values })}
                                            disabled={busy}
                                            dense
                                        />
                                    )}
                                </FieldSet>
                            </>
                        )}

                        {slide === "level" && (
                            <>
                                <StepHeading
                                    headingRef={headingRef}
                                    title="How much programming have you done?"
                                    description="Recommendations start at this difficulty."
                                />
                                <FieldSet disabled={busy}>
                                    <FieldLegend className="sr-only">Experience level</FieldLegend>
                                    <ChoiceRadioGroup
                                        idPrefix="onboarding-level"
                                        options={options.levels}
                                        value={draft.experienceLevel}
                                        onChange={(value) => update({ experienceLevel: value })}
                                        disabled={busy}
                                        describedBy={hintId}
                                    />
                                </FieldSet>
                            </>
                        )}

                        {slide === "goals" && (
                            <>
                                <StepHeading
                                    headingRef={headingRef}
                                    title="What do you want to get out of it?"
                                    description="Choose at least one. Courses that serve these goals come first."
                                />
                                <FieldSet disabled={busy}>
                                    <FieldLegend className="sr-only">Goals (choose at least one)</FieldLegend>
                                    <ChoiceCheckboxGroup
                                        idPrefix="onboarding-goal"
                                        options={options.goals}
                                        values={draft.goalCodes}
                                        onChange={(values) => update({ goalCodes: values })}
                                        disabled={busy}
                                        describedBy={hintId}
                                    />
                                </FieldSet>
                            </>
                        )}

                        {slide === "language" && (
                            <>
                                <StepHeading
                                    headingRef={headingRef}
                                    title="Do you have a favourite language?"
                                    description="Optional. Courses in this language are ranked first."
                                />
                                <FieldSet disabled={busy}>
                                    <FieldLegend className="sr-only">Preferred programming language</FieldLegend>
                                    <ChoiceRadioGroup
                                        idPrefix="onboarding-language"
                                        options={options.languages}
                                        value={languageValue}
                                        onChange={(value) => update({ preferredLanguageId: value === NO_LANGUAGE ? null : Number(value) })}
                                        disabled={busy}
                                        dense
                                    />
                                </FieldSet>
                            </>
                        )}

                        {slide === "review" && (
                            <>
                                <StepHeading
                                    headingRef={headingRef}
                                    title="Check your answers"
                                    description="Edit any of them, then finish to see your recommendations."
                                />
                                <FieldSet disabled={busy}>
                                    <FieldLegend className="sr-only">Your answers</FieldLegend>
                                    <dl className="m-0 divide-y rounded-lg border">
                                        <ReviewRow label="Role" value={names.role.get(draft.roleCode) || "Not chosen"} onEdit={() => handleEdit("role")} disabled={busy} />
                                        <ReviewRow
                                            label="Industries"
                                            value={draft.industryCodes.length
                                                ? draft.industryCodes.map((code) => names.industry.get(code) || code).join(", ")
                                                : "None selected"}
                                            onEdit={() => handleEdit("industry")}
                                            disabled={busy}
                                        />
                                        <ReviewRow
                                            label="Experience level"
                                            value={draft.experienceLevel ? levelLabel(draft.experienceLevel) : "Not chosen"}
                                            onEdit={() => handleEdit("level")}
                                            disabled={busy}
                                        />
                                        <ReviewRow
                                            label="Goals"
                                            value={draft.goalCodes.length
                                                ? draft.goalCodes.map((code) => names.goal.get(code) || code).join(", ")
                                                : "Not chosen"}
                                            onEdit={() => handleEdit("goals")}
                                            disabled={busy}
                                        />
                                        <ReviewRow
                                            label="Preferred language"
                                            value={names.language.get(draft.preferredLanguageId) || "No preference"}
                                            onEdit={() => handleEdit("language")}
                                            disabled={busy}
                                        />
                                    </dl>
                                </FieldSet>
                            </>
                        )}
                    </div>

                    {/* Phones: a bar fixed across the bottom of the screen, always one thumb away. sm+: the foot of a
                        fixed-height card, so Back and Continue stay in the same place on every question. */}
                    <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:rounded-b-lg sm:bg-card sm:px-6 sm:py-3.5">
                        <ValidationHint id={hintId} problems={problems} show={!isValid} />
                        <div id={errorId} role="alert" aria-live="assertive" className="[&:has(p)]:mb-2.5">
                            {error && (
                                <p className="flex items-start gap-1.5 text-sm text-destructive">
                                    <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                    <span>{error}</span>
                                </p>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <Button type="button" variant="ghost" onClick={handleBack} disabled={slideIndex === 0 || busy} className="max-sm:h-11">
                                <LuArrowLeft />
                                Back
                            </Button>
                            <Button type="submit" disabled={!isValid || busy} aria-describedby={`${hintId} ${errorId}`} className="max-sm:h-11 max-sm:flex-1 sm:min-w-36">
                                {(saveStep.isPending || complete.isPending) && <Spinner aria-hidden="true" />}
                                {nextLabel}
                                {!busy && (slide === "review" ? <LuCheck /> : <LuArrowRight />)}
                            </Button>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
}

function OnboardingSkeleton() {
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-12 sm:px-6 lg:pt-10" role="status" aria-busy="true" aria-label="Loading onboarding">
            <Skeleton className="size-7 rounded-md" />
            <div className="space-y-2">
                <Skeleton className="h-9 w-80 max-w-full" />
                <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-80 w-full rounded-lg" />
        </div>
    );
}

export default function OnboardingPage() {
    const { status: sessionStatus } = useSession();

    const catalogQuery = useQuery(onboardingQueries.catalog());
    const stateQuery = useQuery(onboardingQueries.status(sessionStatus));

    const loading = sessionStatus === "loading"
        || catalogQuery.isLoading
        || (sessionStatus === "authenticated" && stateQuery.isLoading);

    if (loading) return <OnboardingSkeleton />;

    if (sessionStatus !== "authenticated") {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-4 py-20 text-center">
                <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <LuUser className="size-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                    <h1 className="text-base font-semibold">Sign in to set up your learning profile</h1>
                    <p className="text-sm text-muted-foreground">Your answers are saved to your CodeDev account.</p>
                </div>
                <Button asChild size="sm">
                    <Link href="/auth">Sign in</Link>
                </Button>
            </div>
        );
    }

    // A failed background refetch keeps the cached data, so only a missing record shows the error.
    if (!catalogQuery.data || !stateQuery.data) {
        const error = catalogQuery.error || stateQuery.error || { status: 500, message: "Could not load onboarding." };
        return (
            <div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6">
                <ErrorReload
                    data={error}
                    title="Could not load onboarding"
                    refetch={() => {
                        catalogQuery.refetch();
                        stateQuery.refetch();
                    }}
                />
            </div>
        );
    }

    // Mounted once with the loaded state: later cache updates (after each save) do not reset the draft.
    return <OnboardingWizard catalog={catalogQuery.data} state={stateQuery.data} sessionStatus={sessionStatus} />;
}
