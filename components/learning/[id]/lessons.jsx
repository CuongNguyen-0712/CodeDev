import { useEffect, useRef } from "react";
import PortableTextRenderer from "../../ui/portableTextRenderer";
import { useCourseSubmitLesson } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { useQuery } from "@tanstack/react-query";
import { courseQueries } from "@/queries/course.query";
import { ErrorReload } from "../../ui/error";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuArrowLeft, LuArrowRight, LuBookOpen, LuCheck, LuCircleCheck, LuLoaderCircle, LuLock } from "react-icons/lu";
import ChallengeSection from "./challengeSection";

import "@/styles/learning/[id]/lesson.css"

export function SubmitLessonButton({ lessonId, courseId, onSubmitted }) {
    const submitLesson = useCourseSubmitLesson();
    const { showAlert: alert } = useApp();

    const handleSubmit = async () => {
        try {
            await submitLesson.mutateAsync({ lessonId, courseId });
            alert(200, "Lesson marked as completed.");
            onSubmitted?.();
        }
        catch (error) {
            console.error("Failed to submit lesson:", error);
            alert(500, "Failed to submit lesson. Please try again.");
        }
    };

    if (submitLesson.isSuccess) {
        return <CompletedBadge />;
    }

    return (
        <Button onClick={handleSubmit} disabled={submitLesson.isPending}>
            {submitLesson.isPending ? <LuLoaderCircle className="animate-spin" /> : <LuCheck />}
            {submitLesson.isPending ? 'Saving...' : 'Mark as completed'}
        </Button>
    );
}

function CompletedBadge() {
    return (
        <Badge variant="success" className="h-8 gap-1.5 px-2.5 text-sm">
            <LuCircleCheck className="size-4!" aria-hidden="true" />
            Lesson completed
        </Badge>
    );
}

function LessonNotice({ icon: Icon, title, children }) {
    return (
        <div className="flex h-full items-center justify-center px-6 py-16">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                </span>
                <h2 className="text-base font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{children}</p>
            </div>
        </div>
    );
}

function StepButton({ lesson, unlocked, direction, onSelect }) {
    if (!lesson) return <div className="hidden sm:block" />;

    const isNext = direction === 'next';
    const Arrow = !unlocked ? LuLock : isNext ? LuArrowRight : LuArrowLeft;

    return (
        <button
            type="button"
            onClick={() => unlocked && onSelect?.(lesson)}
            disabled={!unlocked}
            title={!unlocked ? 'Complete this lesson to unlock the next one.' : lesson.title}
            className={cn(
                'group flex min-w-0 items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-transparent',
                isNext && 'flex-row-reverse text-right'
            )}
        >
            <Arrow className="size-4 shrink-0 text-muted-foreground group-hover:text-primary group-disabled:group-hover:text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">
                    {isNext ? 'Next lesson' : 'Previous lesson'}{!unlocked && ' (locked)'}
                </span>
                <span className="block truncate text-sm font-medium">{lesson.title}</span>
            </span>
        </button>
    );
}

export default function LearningLesson({
    lessonId,
    courseId,
    isSubmit,
    isLocked = false,
    onSubmitted,
    prevLesson,
    nextLesson,
    isPrevUnlocked = true,
    isNextUnlocked = true,
    onSelectLesson,
    challenges = [],
    moduleLabel = null,
    moduleTitle = null,
    lessonPosition = null,
}) {
    const {
        data,
        isLoading,
        isError,
        error,
        refetch
    } = useQuery({
        ...courseQueries.learning(lessonId),
        enabled: Boolean(lessonId && !isLocked),
    });

    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [lessonId]);

    if (!lessonId) {
        return (
            <LessonNotice icon={LuBookOpen} title="Select a lesson">
                Choose a lesson from the syllabus to start reading and coding.
            </LessonNotice>
        );
    }

    if (isLocked) {
        return (
            <LessonNotice icon={LuLock} title="This lesson is locked">
                Complete the lessons before it to unlock it.
            </LessonNotice>
        );
    }

    if (isError) {
        return (
            <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
                <ErrorReload data={error} refetch={refetch} />
            </div>
        );
    }

    return (
        <div ref={scrollRef} className="h-full overflow-y-auto">
            <article className="mx-auto w-full max-w-3xl px-5 pt-8 pb-16 sm:px-8 lg:pt-12">
                {isLoading ? (
                    <div className="space-y-4" aria-busy="true" aria-label="Loading lesson">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-9 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="mt-6 h-48 w-full" />
                    </div>
                ) : (
                    <>
                        <header className="space-y-3 border-b pb-6">
                            {(moduleLabel || lessonPosition) && (
                                <p className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <span className="flex min-w-0 items-center gap-2">
                                        {moduleLabel && <span className="shrink-0 font-mono">{moduleLabel}</span>}
                                        {moduleTitle && <span className="truncate">{moduleTitle}</span>}
                                    </span>
                                    {lessonPosition && (
                                        <span className="shrink-0 font-mono tabular">Lesson {lessonPosition}</span>
                                    )}
                                </p>
                            )}
                            <h1 className="text-3xl leading-tight font-semibold tracking-tight text-foreground text-balance sm:text-4xl">
                                {data?.title}
                            </h1>
                            {data?.description && (
                                <p className="max-w-[65ch] text-base leading-relaxed text-muted-foreground">
                                    {data.description}
                                </p>
                            )}
                        </header>

                        <div className="lesson-prose pt-6">
                            <div className="portable_text_container">
                                <PortableTextRenderer value={data?.content} />
                            </div>
                        </div>

                        {challenges && challenges.length > 0 && (
                            <ChallengeSection
                                key={lessonId}
                                challenges={challenges}
                                onChallengeCompleted={() => onSubmitted?.()}
                            />
                        )}

                        <footer className="mt-12 space-y-4 border-t pt-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm text-muted-foreground">
                                    {isSubmit ? 'You have finished this lesson.' : 'Finished reading? Mark the lesson as completed.'}
                                </p>
                                {isSubmit ? (
                                    <CompletedBadge />
                                ) : (
                                    <SubmitLessonButton
                                        key={lessonId}
                                        lessonId={lessonId}
                                        courseId={courseId}
                                        onSubmitted={onSubmitted}
                                    />
                                )}
                            </div>

                            <nav aria-label="Lesson navigation" className="grid gap-3 sm:grid-cols-2">
                                <StepButton lesson={prevLesson} unlocked={isPrevUnlocked} direction="prev" onSelect={onSelectLesson} />
                                <StepButton lesson={nextLesson} unlocked={isNextUnlocked} direction="next" onSelect={onSelectLesson} />
                            </nav>
                        </footer>
                    </>
                )}
            </article>
        </div>
    );
}
