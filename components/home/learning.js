'use client';

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";

import { ErrorReload } from "../ui/error";
import { progressMapping } from "@/constants/constants";
import { COURSE_STATUS } from "@/components/learning/course";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Progress } from "@/components/shadcn/progress";
import { Skeleton } from "@/components/shadcn/skeleton";

import {
    LuArrowRight,
    LuBookOpen,
    LuChevronDown,
    LuChevronLeft,
    LuChevronRight,
    LuLanguages,
    LuLibrary,
} from "react-icons/lu";

const FALLBACK_IMAGE = '/image/static/no_image.png';
const SKILLS_COLLAPSED_COUNT = 3;
// Status rows on the progress panel: what to continue, then what to start, then what is done.
const STATUS_ORDER = ["in_progress", "enrolled", "completed"];

function handleImageError(e) {
    e.currentTarget.onerror = null;
    e.currentTarget.src = FALLBACK_IMAGE;
}

function pluralCourses(count) {
    return `${count} ${Number(count) === 1 ? 'course' : 'courses'}`;
}

function clampPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(100, Math.max(0, Math.round(number)));
}

function statusMeta(status) {
    return COURSE_STATUS[status] || { label: progressMapping[status]?.label || 'Courses', variant: 'muted' };
}

function PanelHeader({ id, title, meta, leading = null, action = null }) {
    return (
        <div className="flex min-h-14 items-center justify-between gap-2 border-b px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
                {leading}
                <div className="min-w-0">
                    <h2 id={id} className="truncate text-sm font-semibold text-foreground">{title}</h2>
                    {meta !== null && (
                        <p className="truncate text-xs text-muted-foreground tabular">{meta}</p>
                    )}
                </div>
            </div>
            {action}
        </div>
    );
}

function RowsSkeleton({ rows = 3, withBar = false }) {
    return (
        <ul className="m-0 list-none divide-y p-0" aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => (
                <li key={index} className="flex flex-col gap-2.5 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <Skeleton className="size-8 rounded-md" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-3/4" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                    </div>
                    {withBar && <Skeleton className="h-1.5 w-full" />}
                </li>
            ))}
        </ul>
    );
}

function PanelEmpty({ icon: Icon, title, description, action = null }) {
    return (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="max-w-[36ch] text-sm text-muted-foreground">{description}</p>
            </div>
            {action}
        </div>
    );
}

export default function HomeLearning() {
    const { status } = useSession();

    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false);

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.overview(status));

    const coursesByStatus = data?.courses?.[target] || [];
    const targetStatusMeta = target ? statusMeta(target) : null;

    // The query waits for the session, so treat a loading session as loading data.
    const showLoading = isLoading || status === 'loading';

    // Fixed order (what to continue first), whatever order the API returns the counts in.
    const statusRows = data?.summary?.by_status
        ? STATUS_ORDER.filter((s) => s in data.summary.by_status).map((s) => [s, Number(data.summary.by_status[s]) || 0])
        : [];
    const totalCourses = Number(data?.summary?.total ?? 0);

    const languages = data?.languages || [];
    const visibleLanguages = visible ? languages : languages.slice(0, SKILLS_COLLAPSED_COUNT);

    const errorData = error || { status: 500, message: "Could not load your learning overview" };

    return (
        <aside
            id="overview_sidebar"
            aria-label="Your learning"
            className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1"
        >
            {/* 1. Course progress */}
            <section aria-labelledby="home-progress-heading" className="overflow-hidden rounded-lg border bg-card">
                {target ? (
                    <PanelHeader
                        id="home-progress-heading"
                        title={targetStatusMeta?.label || 'Courses'}
                        meta={pluralCourses(data?.summary?.by_status?.[target] ?? coursesByStatus.length)}
                        leading={(
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="-ml-1.5 text-muted-foreground"
                                onClick={() => setTarget(null)}
                                aria-label="Back to status overview"
                            >
                                <LuChevronLeft />
                            </Button>
                        )}
                        action={(
                            <Button asChild variant="ghost" size="sm">
                                <Link href="/learning">
                                    View all
                                    <LuArrowRight />
                                </Link>
                            </Button>
                        )}
                    />
                ) : (
                    <PanelHeader
                        id="home-progress-heading"
                        title="Course progress"
                        meta={showLoading || isError ? null : pluralCourses(totalCourses)}
                        action={(
                            <Button asChild variant="ghost" size="sm">
                                <Link href="/learning">
                                    View all
                                    <LuArrowRight />
                                </Link>
                            </Button>
                        )}
                    />
                )}

                {showLoading ? (
                    <RowsSkeleton rows={3} />
                ) : isError ? (
                    <div className="p-3">
                        <ErrorReload compact data={errorData} refetch={refetch} />
                    </div>
                ) : !target ? (
                    totalCourses === 0 ? (
                        <PanelEmpty
                            icon={LuBookOpen}
                            title="No courses yet"
                            description="Enroll in a course and your progress will show up here."
                            action={(
                                <Button asChild size="sm">
                                    <Link href="/course">
                                        <LuLibrary />
                                        Browse courses
                                    </Link>
                                </Button>
                            )}
                        />
                    ) : (
                        <ul className="m-0 list-none divide-y p-0">
                            {statusRows.map(([s, count]) => {
                                const meta = statusMeta(s);
                                return (
                                    <li key={s}>
                                        <button
                                            type="button"
                                            onClick={() => setTarget(s)}
                                            className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent"
                                        >
                                            {/* Read as "Not started 0 courses. Show courses": starts with the visible text (WCAG 2.5.3). */}
                                            <Badge variant={meta.variant}>{meta.label}</Badge>
                                            <span className={cn("ml-auto text-sm tabular", count ? "text-foreground" : "text-muted-foreground")}>{count}</span>
                                            <span className="sr-only">{count === 1 ? 'course' : 'courses'}. Show courses</span>
                                            <LuChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )
                ) : coursesByStatus.length > 0 ? (
                    <>
                        <ul className="m-0 list-none divide-y p-0">
                            {coursesByStatus.map((course) => {
                                const total = Number(course.total || 0);
                                const progressVal = total > 0
                                    ? clampPercent((Number(course.progress || 0) / total) * 100)
                                    : 0;
                                const subtitle = [course.language_name, course.category_name].filter(Boolean).join(' / ');

                                return (
                                    <li key={course.id}>
                                        <Link
                                            href={`/course/${course.id}`}
                                            className="group/course flex flex-col gap-2.5 px-4 py-3 transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={course.language_logo || FALLBACK_IMAGE}
                                                        alt=""
                                                        width={18}
                                                        height={18}
                                                        className="size-[18px] object-contain"
                                                        onError={handleImageError}
                                                    />
                                                </span>
                                                <div className="min-w-0">
                                                    <p
                                                        className="truncate text-sm font-medium text-foreground group-hover/course:text-primary-ink"
                                                        title={course.title}
                                                    >
                                                        {course.title}
                                                    </p>
                                                    <p className="truncate tabular text-xs text-muted-foreground">
                                                        {subtitle || 'General'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Progress
                                                    value={progressVal}
                                                    className="h-1.5 flex-1 bg-muted"
                                                    aria-label={`${course.title} progress`}
                                                />
                                                <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular">
                                                    {progressVal}%
                                                </span>
                                            </div>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>

                        {(data?.summary?.by_status?.[target] > 10) && (
                            <div className="border-t p-2">
                                <Button asChild variant="ghost" size="sm" className="w-full">
                                    <Link href="/learning">
                                        View all {targetStatusMeta?.label?.toLowerCase()} courses
                                        <LuArrowRight />
                                    </Link>
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <PanelEmpty
                        icon={LuBookOpen}
                        title={`No ${targetStatusMeta?.label?.toLowerCase() || ''} courses`}
                        description="Courses with this status will be listed here."
                        action={(
                            <Button asChild variant="outline" size="sm">
                                <Link href="/learning">Open My learning</Link>
                            </Button>
                        )}
                    />
                )}
            </section>

            {/* 2. Language skills */}
            <section aria-labelledby="home-skills-heading" className="overflow-hidden rounded-lg border bg-card">
                <PanelHeader
                    id="home-skills-heading"
                    title="Language skills"
                    meta={showLoading || isError || languages.length < 2 ? null : `${languages.length} languages`}
                />

                {showLoading ? (
                    <RowsSkeleton rows={2} withBar />
                ) : isError ? (
                    <div className="p-3">
                        <ErrorReload compact data={errorData} refetch={refetch} />
                    </div>
                ) : languages.length > 0 ? (
                    <>
                        <ul id="home-skills-list" className="m-0 list-none divide-y p-0">
                            {visibleLanguages.map((item, index) => {
                                const percent = clampPercent(item.percentage);
                                return (
                                    <li key={item.name || index} className="flex flex-col gap-2.5 px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={item.logo || FALLBACK_IMAGE}
                                                    alt=""
                                                    width={18}
                                                    height={18}
                                                    className="size-[18px] object-contain"
                                                    onError={handleImageError}
                                                />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                                                {item.total !== undefined && (
                                                    <p className="text-xs text-muted-foreground tabular">
                                                        {pluralCourses(item.total)}
                                                    </p>
                                                )}
                                            </div>
                                            {/* A share only means something next to other languages. */}
                                            {languages.length > 1 && (
                                                <span className="shrink-0 text-sm text-foreground tabular">{percent}%</span>
                                            )}
                                        </div>
                                        {languages.length > 1 && (
                                            <Progress
                                                value={percent}
                                                className="h-1.5 bg-muted"
                                                aria-label={`${item.name} share of your active and completed courses`}
                                            />
                                        )}
                                    </li>
                                );
                            })}
                        </ul>

                        {languages.length > SKILLS_COLLAPSED_COUNT && (
                            <div className="border-t p-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => setVisible(!visible)}
                                    aria-expanded={visible}
                                    aria-controls="home-skills-list"
                                >
                                    {visible ? 'Show less' : `Show all ${languages.length} languages`}
                                    <LuChevronDown className={visible ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <PanelEmpty
                        icon={LuLanguages}
                        title="No language data yet"
                        description="Start a course to see how your active and completed courses split across languages."
                    />
                )}
            </section>
        </aside>
    );
}
