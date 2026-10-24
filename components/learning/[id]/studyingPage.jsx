'use client'
import { useState, useEffect, useRef, useTransition } from "react"
import { usePathname, useSearchParams } from "next/navigation";

import { ErrorReload } from "../../ui/error";

import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";
import { useRouterActions } from "@/router/useRouterActions";
import { recordLessonVisitAction } from "@/actions/course.actions";
import { callWithAuthRetry } from "@/lib/actionResult";
import useViewport from "@/hooks/useViewport";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";
import { Progress } from "@/components/shadcn/progress";
import { ScrollArea } from "@/components/shadcn/scroll-area";
import { Separator } from "@/components/shadcn/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/shadcn/sheet";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

import LearningLesson from "./lessons";
import { LevelPointsChip } from "@/components/ui/level";

import {
    LuArrowLeft,
    LuChevronRight,
    LuCircle,
    LuCircleCheck,
    LuCircleDot,
    LuExternalLink,
    LuInfo,
    LuLoaderCircle,
    LuLock,
    LuPanelLeftClose,
    LuPanelLeftOpen,
    LuRefreshCw,
    LuX,
} from "react-icons/lu";

function LessonStatusIcon({ status, locked }) {
    if (locked) return <LuLock className="size-3.5 text-muted-foreground" aria-hidden="true" />;
    if (status === 'completed') return <LuCircleCheck className="size-3.5 text-success" aria-hidden="true" />;
    if (status === 'in_progress') return <LuCircleDot className="size-3.5 text-primary-ink" aria-hidden="true" />;
    return <LuCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />;
}

// Pass rates a course with completion_rules needs on top of finishing every lesson
// (public.course_completion_status). null for courses that only need the lessons.
function CompletionRequirements({ completion, completedLessons, totalLessons }) {
    if (!completion) return null;

    const rows = [
        { label: 'Quizzes passed', ...completion.quiz },
        { label: 'Coding passed', ...completion.coding },
    ].filter((row) => row.total > 0);
    const hard = completion.hard || {};
    const rateMet = (row) => row.passed * 100 >= row.minPercent * row.total;

    return (
        <section aria-labelledby="completion-heading" className="space-y-2 border-t px-4 py-3 text-xs">
            <h3 id="completion-heading" className="flex items-center gap-1.5 font-semibold text-foreground">
                {completion.met
                    ? <LuCircleCheck className="size-3.5 text-success" aria-hidden="true" />
                    : <LuCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />}
                To complete this course
            </h3>
            <ul className="list-none space-y-1 text-muted-foreground">
                <li className={cn('flex justify-between gap-2', totalLessons > 0 && completedLessons >= totalLessons && 'text-success')}>
                    <span>Lessons completed</span>
                    <span className="tabular">{completedLessons}/{totalLessons}</span>
                </li>
                {rows.map((row) => (
                    <li key={row.label} className={cn('flex justify-between gap-2', rateMet(row) && 'text-success')}>
                        <span>{row.label}, {row.minPercent}% needed</span>
                        <span className="tabular">{row.passed}/{row.total}</span>
                    </li>
                ))}
                {hard.required > 0 && (
                    <li className={cn('flex justify-between gap-2', hard.passed >= hard.required && 'text-success')}>
                        <span>Hard coding passed</span>
                        <span className="tabular">{hard.passed}/{hard.required}</span>
                    </li>
                )}
            </ul>
        </section>
    );
}

function SyllabusPanel({
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    allLessons,
    selectedData,
    setSelectedData,
    isLessonUnlocked,
    onSelectLesson,
    completedLessonsCount,
    totalLessonsCount,
    onClose = null,
}) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
                <h2 className="text-sm font-semibold">Syllabus</h2>
                <div className="flex items-center gap-1">
                    <span className="mr-1 text-xs text-muted-foreground tabular">
                        {completedLessonsCount}/{totalLessonsCount}
                    </span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground"
                                onClick={() => refetch()}
                                disabled={isFetching}
                                aria-label="Refresh course progress"
                            >
                                <LuRefreshCw className={cn(isFetching && 'animate-spin')} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh progress</TooltipContent>
                    </Tooltip>
                    {onClose && (
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                            onClick={onClose}
                            aria-label="Close syllabus"
                        >
                            <LuX />
                        </Button>
                    )}
                </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
                <nav aria-label="Course syllabus" className="p-2">
                    {isLoading ? (
                        <div className="space-y-3 p-2">
                            {[0, 1, 2].map((index) => (
                                <div key={index} className="space-y-2">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-full" />
                                    <Skeleton className="h-3 w-5/6" />
                                </div>
                            ))}
                        </div>
                    ) : isError ? (
                        <ErrorReload data={error} refetch={refetch} compact />
                    ) : data?.modules?.length > 0 ? (
                        <ol className="list-none space-y-1">
                            {data.modules.map((module, index) => {
                                const isModuleOpen = selectedData?.module === module.id;
                                const lessons = module.lessons || [];
                                const completedInModule = lessons.filter(l => l.status === 'completed').length;

                                return (
                                    <li key={module.id || index}>
                                        <Collapsible
                                            open={isModuleOpen}
                                            onOpenChange={(open) => setSelectedData(prev => ({
                                                ...prev,
                                                module: open ? module.id : null,
                                            }))}
                                        >
                                            <CollapsibleTrigger className="group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-sidebar-accent">
                                                <LuChevronRight
                                                    className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block tabular text-[11px] text-muted-foreground">
                                                        Chapter {index + 1}
                                                    </span>
                                                    <span className="block text-[13px] leading-snug font-medium text-foreground">
                                                        {module.title}
                                                    </span>
                                                </span>
                                                <span className="mt-0.5 shrink-0 text-[11px] text-muted-foreground tabular">
                                                    {completedInModule}/{lessons.length}
                                                </span>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                                <ul className="mt-0.5 mb-1.5 list-none space-y-0.5 pl-4">
                                                    {lessons.map((lesson, lIndex) => {
                                                        const isCurrent = selectedData?.lesson === lesson.id;
                                                        const overallIndex = allLessons.findIndex(l => l.id === lesson.id);
                                                        const isLocked = !isLessonUnlocked(lesson, overallIndex);
                                                        const hasChallenges = lesson.challenges?.length > 0;
                                                        const challengeKind = lesson.challenges?.some(c => c?.type && c.type !== 'quiz') ? 'Code' : 'Quiz';

                                                        return (
                                                            <li key={lesson.id || lIndex}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => !isLocked && onSelectLesson(lesson, module.id)}
                                                                    disabled={isLocked}
                                                                    aria-current={isCurrent ? 'step' : undefined}
                                                                    title={isLocked ? 'Complete the previous lesson to unlock this one.' : lesson.title}
                                                                    className={cn(
                                                                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent',
                                                                        isCurrent && 'bg-sidebar-accent font-medium text-sidebar-foreground'
                                                                    )}
                                                                >
                                                                    <LessonStatusIcon status={lesson.status} locked={isLocked} />
                                                                    <span className="w-5 shrink-0 text-[11px] text-muted-foreground tabular">
                                                                        {lIndex + 1}
                                                                    </span>
                                                                    <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                                                                    {hasChallenges && (
                                                                        <Badge variant="outline" className="h-4 px-1 tabular text-[10px] text-muted-foreground">
                                                                            {challengeKind}
                                                                        </Badge>
                                                                    )}
                                                                    <span className="sr-only">
                                                                        {isLocked ? '(locked)' : lesson.status === 'completed' ? '(completed)' : lesson.status === 'in_progress' ? '(in progress)' : ''}
                                                                    </span>
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    </li>
                                );
                            })}
                        </ol>
                    ) : (
                        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                            No chapters have been published for this course yet.
                        </p>
                    )}
                </nav>
            </ScrollArea>
            <CompletionRequirements
                completion={data?.completion}
                completedLessons={completedLessonsCount}
                totalLessons={totalLessonsCount}
            />
        </div>
    );
}

export default function StudyingPage({ params }) {
    const { navigate } = useRouterActions();
    const { status } = useSession();
    const viewport = useViewport();
    const isCompact = viewport.width > 0 && viewport.width < 1024;

    const [desktopSyllabus, setDesktopSyllabus] = useState(true);
    const [mobileSyllabus, setMobileSyllabus] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [isNavigating, startTransition] = useTransition();

    const {
        data,
        isLoading,
        isError,
        error,
        refetch,
        isFetching,
        dataUpdatedAt
    } = useQuery(userQueries.learningProgress(status, params.id));

    const [selectedData, setSelectedData] = useState(null);

    // Compute all flat lessons and stats
    const allLessons = data?.modules?.flatMap(module =>
        (module.lessons || []).map(lesson => ({
            ...lesson,
            module_id: module.id,
            module_title: module.title,
        }))
    ) || [];

    const completedLessonsCount = allLessons.filter(l => l.status === 'completed').length;
    const totalLessonsCount = allLessons.length;
    const totalChallengesCount = allLessons.reduce((acc, l) => acc + (l.challenges?.length || 0), 0);
    const progressPercent = totalLessonsCount > 0
        ? Math.round((completedLessonsCount / totalLessonsCount) * 100)
        : 0;

    const getCurrentLesson = (courseData) => {
        if (!courseData?.modules?.length) return null;

        const lessons = courseData.modules
            .flatMap(module => module.lessons || [])
            .filter(lesson => lesson.status !== 'enrolled')
            .sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));

        const targetLesson = lessons[0] || courseData.modules[0]?.lessons?.[0];

        if (!targetLesson) return null;

        // Find module ID
        const parentModule = courseData.modules.find(m =>
            m.lessons?.some(l => l.id === targetLesson.id)
        );

        return {
            module: parentModule?.id ?? targetLesson.module_id ?? null,
            lesson: targetLesson.id,
            status: targetLesson.status
        };
    };

    const pathname = usePathname();
    const searchParams = useSearchParams();
    const lessonParam = searchParams.get('lesson');

    // `?lesson=<id>` (other params kept). Changing lessons drops the `#challenge-…` hash.
    const lessonUrl = (lessonId, hash = '') => {
        const query = new URLSearchParams(searchParams.toString());
        query.set('lesson', String(lessonId));
        return `${pathname}?${query.toString()}${hash}`;
    };

    // `?lesson=` is the source of truth for the open lesson, so refresh, shared links and
    // back/forward all land on it. A missing, unknown or locked lesson falls back to the resume
    // point (latest last_seen) and the URL is corrected in place.
    useEffect(() => {
        if (!data) return;

        const index = lessonParam ? allLessons.findIndex((l) => String(l.id) === lessonParam) : -1;
        const fromUrl = index >= 0 ? allLessons[index] : null;

        if (fromUrl && isLessonUnlocked(fromUrl, index)) {
            if (String(selectedData?.lesson) !== String(fromUrl.id)) {
                setSelectedData({ module: fromUrl.module_id, lesson: fromUrl.id, status: fromUrl.status });
            }
            return;
        }

        const fallback = getCurrentLesson(data);
        if (!fallback) return;

        setSelectedData(fallback);
        // Native history calls are synced by the Next.js router without a server round trip.
        const keepHash = lessonParam ? '' : window.location.hash;
        window.history.replaceState(null, '', lessonUrl(fallback.lesson, keepHash));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, lessonParam]);

    useEffect(() => {
        if (!data) return;
        // Keep selected lesson synced if updated
        if (selectedData?.lesson) {
            const updated = allLessons.find(l => l.id === selectedData.lesson);
            if (updated && updated.status !== selectedData.status) {
                setSelectedData(prev => ({ ...prev, status: updated.status }));
            }
        }
    }, [dataUpdatedAt]);

    // Leaving the compact layout closes the syllabus sheet.
    useEffect(() => {
        if (!isCompact) setMobileSyllabus(false);
    }, [isCompact]);

    const isLessonUnlocked = (lesson, indexInAll) => {
        if (!lesson) return false;
        // First lesson of the whole course is always unlocked
        if (indexInAll === 0) return true;
        return lesson.status === 'completed' || lesson.status === 'in_progress';
    };

    const handleSelectLesson = (lesson, moduleId) => {
        if (!lesson) return;
        const lessonIndex = allLessons.findIndex(l => l.id === lesson.id);
        const isUnlocked = isLessonUnlocked(lesson, lessonIndex);
        if (!isUnlocked) return;

        // A history entry per lesson: the browser Back button returns to the previous lesson.
        if (String(lesson.id) !== lessonParam) {
            window.history.pushState(null, '', lessonUrl(lesson.id));
        }

        setSelectedData({
            module: moduleId,
            lesson: lesson.id,
            status: lesson.status,
        });

        setMobileSyllabus(false);
    };

    const currentLessonIndex = allLessons.findIndex(l => l.id === selectedData?.lesson);
    const currentLesson = currentLessonIndex >= 0 ? allLessons[currentLessonIndex] : null;
    const prevLesson = currentLessonIndex > 0 ? allLessons[currentLessonIndex - 1] : null;
    const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < allLessons.length - 1
        ? allLessons[currentLessonIndex + 1]
        : null;

    const isPrevUnlocked = prevLesson ? isLessonUnlocked(prevLesson, currentLessonIndex - 1) : false;
    const isNextUnlocked = nextLesson ? isLessonUnlocked(nextLesson, currentLessonIndex + 1) : false;
    const isCurrentLessonLocked = selectedData ? !isLessonUnlocked(selectedData, currentLessonIndex) : false;

    const currentModuleIndex = data?.modules?.findIndex(m => m.id === currentLesson?.module_id) ?? -1;

    // Course history: every lesson the learner opens becomes the resume point on the server.
    const lastRecordedRef = useRef(null);
    useEffect(() => {
        const lessonId = selectedData?.lesson;
        if (status !== 'authenticated' || !lessonId || isCurrentLessonLocked) return;
        if (lastRecordedRef.current === String(lessonId)) return;

        lastRecordedRef.current = String(lessonId);
        callWithAuthRetry(() => recordLessonVisitAction({ courseId: params.id, lessonId })).catch(() => {
            lastRecordedRef.current = null;
        });
    }, [selectedData?.lesson, status, isCurrentLessonLocked, params.id]);

    const handleToggleSyllabus = () => {
        if (isCompact) {
            setMobileSyllabus(prev => !prev);
        } else {
            setDesktopSyllabus(prev => !prev);
        }
    };

    const isSyllabusVisible = isCompact ? mobileSyllabus : desktopSyllabus;

    const syllabusProps = {
        data,
        isLoading,
        isError,
        error,
        refetch,
        isFetching,
        allLessons,
        selectedData,
        setSelectedData,
        isLessonUnlocked,
        onSelectLesson: handleSelectLesson,
        completedLessonsCount,
        totalLessonsCount,
    };

    return (
        <div className="flex h-dvh w-full min-w-0 flex-col bg-background">
            {/* Workspace bar */}
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" onClick={() => navigate({ path: '/learning' })} aria-label="Back to my learning">
                            <LuArrowLeft />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Back to my learning</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={handleToggleSyllabus}
                            aria-label={isSyllabusVisible ? 'Hide syllabus' : 'Show syllabus'}
                            aria-pressed={isSyllabusVisible}
                        >
                            {isSyllabusVisible ? <LuPanelLeftClose /> : <LuPanelLeftOpen />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{isSyllabusVisible ? 'Hide syllabus' : 'Show syllabus'}</TooltipContent>
                </Tooltip>

                <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />

                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={data?.language_logo || '/image/static/default.svg'}
                        alt=""
                        width={18}
                        height={18}
                        className="size-[18px] shrink-0 object-contain max-sm:hidden"
                        onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = '/image/static/default.svg';
                        }}
                    />
                    {isLoading ? (
                        <Skeleton className="h-4 w-48" />
                    ) : (
                        <h1 className="truncate text-sm font-semibold" title={data?.title}>
                            {data?.title || 'Course'}
                        </h1>
                    )}
                    {totalLessonsCount > 0 && (
                        <div className="ml-2 hidden shrink-0 items-center gap-2 md:flex">
                            <Progress value={progressPercent} className="h-1.5 w-28 bg-muted" aria-label="Course progress" />
                            <span className="text-xs text-muted-foreground tabular">
                                {completedLessonsCount}/{totalLessonsCount} &middot; {progressPercent}%
                            </span>
                        </div>
                    )}
                </div>

                <LevelPointsChip />

                <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)} className="text-muted-foreground hover:text-foreground">
                    <LuInfo />
                    <span className="max-sm:sr-only">Course details</span>
                </Button>
            </header>

            <div className="flex min-h-0 flex-1">
                {!isCompact && desktopSyllabus && (
                    <aside className="w-72 shrink-0 border-r bg-sidebar xl:w-80" aria-label="Syllabus panel">
                        <SyllabusPanel {...syllabusProps} />
                    </aside>
                )}

                <main className="min-w-0 flex-1">
                    {isLoading ? (
                        <div className="mx-auto w-full max-w-3xl space-y-4 px-5 py-10 sm:px-8">
                            <Skeleton className="h-3 w-40" />
                            <Skeleton className="h-9 w-3/4" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="mt-6 h-40 w-full" />
                        </div>
                    ) : isError ? (
                        <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
                            <ErrorReload data={error} refetch={refetch} />
                        </div>
                    ) : (
                        <LearningLesson
                            lessonId={selectedData?.lesson}
                            courseId={params.id}
                            isSubmit={selectedData?.status === 'completed'}
                            isLocked={isCurrentLessonLocked}
                            onSubmitted={() => refetch()}
                            prevLesson={prevLesson}
                            nextLesson={nextLesson}
                            isPrevUnlocked={isPrevUnlocked}
                            isNextUnlocked={isNextUnlocked}
                            onSelectLesson={(lesson) => handleSelectLesson(lesson, lesson.module_id)}
                            challenges={currentLesson?.challenges || []}
                            moduleLabel={currentModuleIndex >= 0 ? `Chapter ${currentModuleIndex + 1}` : null}
                            moduleTitle={currentLesson?.module_title}
                            lessonPosition={currentLessonIndex >= 0 ? `${currentLessonIndex + 1} of ${totalLessonsCount}` : null}
                        />
                    )}
                </main>
            </div>

            {/* Syllabus on tablets and phones */}
            <Sheet open={isCompact && mobileSyllabus} onOpenChange={setMobileSyllabus}>
                <SheetContent
                    side="left"
                    showCloseButton={false}
                    className="w-[min(20rem,88vw)] gap-0 bg-sidebar p-0"
                    onOpenAutoFocus={(event) => {
                        // Land on the current lesson instead of the first toolbar
                        // button, which would also pop its tooltip.
                        const current = event.currentTarget?.querySelector?.('[aria-current="step"]');
                        if (current) {
                            event.preventDefault();
                            current.focus();
                        }
                    }}
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>Course syllabus</SheetTitle>
                        <SheetDescription>Chapters and lessons in this course.</SheetDescription>
                    </SheetHeader>
                    <SyllabusPanel {...syllabusProps} onClose={() => setMobileSyllabus(false)} />
                </SheetContent>
            </Sheet>

            {/* Course details */}
            <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
                <SheetContent side="right" className="w-[min(26rem,92vw)] gap-0">
                    <SheetHeader className="border-b">
                        <SheetTitle>Course details</SheetTitle>
                        <SheetDescription>Overview of what this course covers and your progress.</SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 space-y-6 overflow-y-auto p-4">
                        {isLoading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-10 w-10 rounded-md" />
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        ) : isError ? (
                            <ErrorReload data={error} refetch={refetch} compact />
                        ) : data ? (
                            <>
                                <div className="space-y-3">
                                    <span className="flex size-10 items-center justify-center rounded-md border bg-background">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={data?.language_logo || '/image/static/default.svg'}
                                            alt=""
                                            width={24}
                                            height={24}
                                            className="size-6 object-contain"
                                            onError={(e) => {
                                                e.currentTarget.onerror = null;
                                                e.currentTarget.src = '/image/static/default.svg';
                                            }}
                                        />
                                    </span>
                                    <h2 className="text-lg font-semibold tracking-tight">{data?.title}</h2>
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        {data?.description || data?.concept || 'No description has been written for this course yet.'}
                                    </p>
                                </div>

                                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
                                    {[
                                        { label: 'Chapters', value: data?.modules?.length || 0 },
                                        { label: 'Lessons', value: totalLessonsCount },
                                        { label: 'Challenges', value: totalChallengesCount },
                                        { label: 'Completed', value: `${progressPercent}%` },
                                    ].map((stat) => (
                                        <div key={stat.label} className="bg-background px-3 py-2.5">
                                            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                                            <dd className="text-lg font-medium tabular">{stat.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">Course data is not available.</p>
                        )}
                    </div>

                    <SheetFooter className="border-t">
                        <Button
                            onClick={() => startTransition(() => navigate({ path: `/course/${data?.id}` }))}
                            disabled={isNavigating || isLoading || !data?.id}
                        >
                            {isNavigating ? <LuLoaderCircle className="animate-spin" /> : <LuExternalLink />}
                            Open course page
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}
