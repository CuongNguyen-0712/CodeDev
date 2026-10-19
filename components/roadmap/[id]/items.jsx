'use client';
import Link from 'next/link';

import { cn } from '@/lib/utils';

import { Badge } from '@/components/shadcn/badge';
import { Progress } from '@/components/shadcn/progress';

import { LuBookOpen, LuCheck, LuChevronRight } from 'react-icons/lu';

const FALLBACK_LOGO = '/image/static/no_image.png';

export const pad = (value) => String(value).padStart(2, '0');

// Status is always shown as a tinted badge with a text label, never colour alone.
export const NODE_STATUS = {
    not_started: { label: 'Not started', variant: 'muted' },
    in_progress: { label: 'In progress', variant: 'primary' },
    completed: { label: 'Completed', variant: 'success' },
    empty: { label: 'No courses yet', variant: 'outline' },
};

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

// `progress` on a roadmap course is the number of lessons the viewer has
// completed (0 for visitors who are not signed in).
export function getCourseProgress(course) {
    const lessons = toNumber(course?.lessons);
    const completed = Math.min(toNumber(course?.progress), lessons);
    const percent = lessons > 0 ? Math.round((completed / lessons) * 100) : 0;

    return {
        lessons,
        completed,
        percent,
        isComplete: lessons > 0 && completed >= lessons,
    };
}

// A step is tracked against its core courses (priority 0). When a step only
// lists recommended courses, all of them count.
export function getNodeProgress(node) {
    const courses = Array.isArray(node?.courses) ? node.courses : [];
    const core = courses.filter((course) => course?.priority === 0);
    const tracked = core.length > 0 ? core : courses;

    const totals = tracked.reduce((acc, course) => {
        const { lessons, completed } = getCourseProgress(course);
        return { lessons: acc.lessons + lessons, completed: acc.completed + completed };
    }, { lessons: 0, completed: 0 });

    let status = 'not_started';
    if (courses.length === 0) status = 'empty';
    else if (totals.lessons > 0 && totals.completed >= totals.lessons) status = 'completed';
    else if (totals.completed > 0) status = 'in_progress';

    return {
        courses,
        status,
        totalLessons: totals.lessons,
        completedLessons: totals.completed,
        percent: totals.lessons > 0 ? Math.round((totals.completed / totals.lessons) * 100) : 0,
    };
}

export function StageMarker({ status, number }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-xs font-medium text-muted-foreground tabular',
                status === 'completed' && 'border-success/30 bg-success-soft text-success',
                status === 'in_progress' && 'border-primary/40 bg-primary-soft text-primary-soft-foreground'
            )}
        >
            {status === 'completed' ? <LuCheck className="size-3.5" /> : number}
        </span>
    );
}

export default function Node({ data, handleNodeClick, isSelected = false, ...props }) {
    const { title, description } = data;
    const progress = getNodeProgress(data);
    const status = NODE_STATUS[progress.status];
    const courseCount = progress.courses.length;

    return (
        <button
            type="button"
            onClick={handleNodeClick}
            aria-current={isSelected ? 'true' : undefined}
            data-roadmap-node={data.id}
            className={cn(
                'group flex w-full flex-col gap-2 rounded-lg border border-border bg-card px-3.5 py-3 text-left outline-none transition-all duration-150',
                'hover:border-primary/50 hover:shadow-xs hover:bg-accent/30 active:bg-accent',
                'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                isSelected && 'border-primary/60 bg-primary-soft/50 shadow-xs hover:border-primary/70 hover:bg-primary-soft/60'
            )}
            {...props}
        >
            <span className="flex w-full items-start justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold text-foreground">{title}</span>
                <Badge variant={status.variant} className="mt-px">{status.label}</Badge>
            </span>

            {description && (
                <span className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                    {description}
                </span>
            )}

            <span className="flex w-full items-center gap-3 font-mono text-xs text-muted-foreground tabular">
                <span className="flex shrink-0 items-center gap-1.5">
                    <LuBookOpen className="size-3.5" aria-hidden="true" />
                    {courseCount} {courseCount === 1 ? 'course' : 'courses'}
                </span>
                {progress.totalLessons > 0 && (
                    <>
                        <Progress
                            value={progress.percent}
                            className="h-1 max-w-40 flex-1 bg-muted"
                            aria-hidden="true"
                        />
                        <span className="shrink-0">
                            {progress.completedLessons}/{progress.totalLessons} lessons
                        </span>
                    </>
                )}
            </span>
        </button>
    );
}

function CourseRow({ course }) {
    const { lessons, completed, percent, isComplete } = getCourseProgress(course);
    const meta = [course.language, course.category].filter(Boolean).join(' / ');

    return (
        <li>
            <Link
                href={`/course/${course.id}`}
                className="group flex items-start gap-3 rounded-md px-2 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring active:bg-accent"
            >
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={course.logo || FALLBACK_LOGO}
                        alt=""
                        width={20}
                        height={20}
                        loading="lazy"
                        className="size-5 object-contain"
                        onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = FALLBACK_LOGO;
                        }}
                    />
                </span>
                <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm leading-snug font-medium text-foreground group-hover:text-primary-ink">
                            {course.title}
                        </span>
                        <LuChevronRight
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true"
                        />
                    </span>
                    {meta && (
                        <span className="block truncate font-mono text-xs text-muted-foreground">{meta}</span>
                    )}
                    {lessons > 0 ? (
                        <span className="flex items-center gap-2">
                            <Progress value={percent} className="h-1 flex-1 bg-muted" aria-hidden="true" />
                            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">
                                {isComplete ? 'Completed' : `${completed}/${lessons}`}
                            </span>
                        </span>
                    ) : (
                        <span className="block text-xs text-muted-foreground">No lessons published yet</span>
                    )}
                </span>
            </Link>
        </li>
    );
}

export function NodeCourseList({ courses = [] }) {
    const core = courses.filter((course) => course?.priority === 0);
    const recommended = courses.filter((course) => course?.priority !== 0);

    if (courses.length === 0) {
        return (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No courses are linked to this step yet.
            </p>
        );
    }

    const groups = [
        { key: 'core', title: 'Core courses', hint: 'Complete these to finish the step.', items: core },
        { key: 'recommended', title: 'Recommended', hint: 'Optional courses that go deeper.', items: recommended },
    ].filter((group) => group.items.length > 0);

    return (
        <div className="space-y-5">
            {groups.map((group) => (
                <section key={group.key} aria-labelledby={`node-courses-${group.key}`} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 px-2">
                        <h4 id={`node-courses-${group.key}`} className="text-xs font-semibold text-foreground">
                            {group.title}
                        </h4>
                        <span className="font-mono text-xs text-muted-foreground tabular">{group.items.length}</span>
                    </div>
                    {groups.length > 1 && (
                        <p className="px-2 text-xs text-muted-foreground">{group.hint}</p>
                    )}
                    <ul className="list-none space-y-0.5">
                        {group.items.map((course, index) => (
                            <CourseRow key={course.id || index} course={course} />
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
