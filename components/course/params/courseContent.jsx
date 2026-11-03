// The course page body, without hooks: rendered on the server from the cached public course
// (app/course/[id]) and, for the rare client fallback, by previewPage. Viewer-specific and
// interactive parts are islands (./courseIslands), each behind a small <Suspense>.
import { Suspense } from "react";
import Link from "next/link";

import ExpandableText from "../../ui/expandableText";

import CommentPage from "./commentPage";
import { BackToCourses, CourseActions, CourseCover, EnrollmentBadge, LanguageLogo, MobilePurchaseActions } from "./courseIslands";
import { LEVEL_ICON, formatDuration } from "../courseMeta";

import { levelMapping } from "@/constants/constants";
import { formatMoney, formatPoints, isPremium, offersOf } from "@/components/commerce/format";

import { Avatar, AvatarFallback } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/shadcn/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";

import {
    LuChevronRight,
    LuCirclePlay,
    LuCode,
    LuFileText,
    LuSignalLow,
    LuStar,
} from "react-icons/lu";

// `content_type` also carries storage values such as "sanity" (rich text in the CMS),
// so only real lesson formats get a label; everything else reads as a written lesson.
const getLessonFormat = (type) => {
    const lower = String(type || '').toLowerCase();
    if (lower.includes('video')) return { Icon: LuCirclePlay, label: 'Video' };
    if (lower.includes('code') || lower.includes('exercise')) return { Icon: LuCode, label: 'Exercise' };
    if (lower.includes('quiz')) return { Icon: LuFileText, label: 'Quiz' };
    return { Icon: LuFileText, label: null };
};

const getInitials = (name) => String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';

// Prices live in commerce offers (catalog.course.cost is deprecated).
export function coursePrice(course) {
    const premium = isPremium(course);
    const { money, points } = offersOf(course);
    const label = [money && formatMoney(money.amountMinor, money.currency), points && formatPoints(points)]
        .filter(Boolean).join(' or ') || 'Premium';
    return { premium, label };
}

/** Sticky top bar with the back button and the breadcrumb. */
export function CourseTopBar({ title, loading = false }) {
    return (
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
            <BackToCourses />

            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />

            <Breadcrumb className="min-w-0 flex-1">
                <BreadcrumbList className="flex-nowrap">
                    <BreadcrumbItem className="shrink-0">
                        <BreadcrumbLink asChild>
                            <Link href="/course" className="rounded-sm">Courses</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem className="min-w-0">
                        {loading ? (
                            <Skeleton className="h-4 w-40" />
                        ) : (
                            <BreadcrumbPage className="truncate font-medium" title={title}>
                                {title || 'Course details'}
                            </BreadcrumbPage>
                        )}
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
        </header>
    );
}

function ActionsSkeleton() {
    return (
        <div className="flex gap-2" role="status" aria-label="Loading course actions">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-28" />
        </div>
    );
}

function Syllabus({ modules }) {
    const totalLessons = modules.reduce((acc, item) => acc + (item.lessons?.length || 0), 0);

    return (
        <section aria-labelledby="course-syllabus-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="course-syllabus-heading" className="text-base font-semibold">Syllabus</h2>
                <span className="text-xs text-muted-foreground tabular">
                    {modules.length} {modules.length === 1 ? 'chapter' : 'chapters'} &middot; {totalLessons} {totalLessons === 1 ? 'lesson' : 'lessons'}
                </span>
            </div>

            {modules.length > 0 ? (
                <ol className="list-none divide-y overflow-hidden rounded-lg border bg-card">
                    {modules.map((item, index) => {
                        const lessons = item.lessons || [];

                        return (
                            <li key={index}>
                                <Collapsible defaultOpen={index === 0}>
                                    <CollapsibleTrigger className="group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset">
                                        <LuChevronRight
                                            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block tabular text-xs text-muted-foreground">
                                                Chapter {index + 1}
                                            </span>
                                            <span className="block text-sm leading-snug font-medium text-foreground">
                                                {item.title}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-xs text-muted-foreground tabular">
                                            {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
                                        </span>
                                    </CollapsibleTrigger>

                                    <CollapsibleContent>
                                        {lessons.length > 0 ? (
                                            <ul className="list-none border-t bg-muted/30 py-1">
                                                {lessons.map((child, idx) => {
                                                    const { Icon: LessonIcon, label: formatLabel } = getLessonFormat(child.content_type);

                                                    return (
                                                        <li key={idx} className="flex min-h-9 items-center gap-3 py-1.5 pr-4 pl-11">
                                                            <LessonIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                            <span className="w-8 shrink-0 text-xs text-muted-foreground tabular">
                                                                {index + 1}.{idx + 1}
                                                            </span>
                                                            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={child.title}>
                                                                {child.title}
                                                            </span>
                                                            {formatLabel && (
                                                                <Badge variant="outline" className="tabular text-muted-foreground max-sm:hidden">
                                                                    {formatLabel}
                                                                </Badge>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        ) : (
                                            <p className="border-t bg-muted/30 py-3 pr-4 pl-11 text-[13px] text-muted-foreground">
                                                No lessons have been published in this chapter yet.
                                            </p>
                                        )}
                                    </CollapsibleContent>
                                </Collapsible>
                            </li>
                        );
                    })}
                </ol>
            ) : (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    No chapters have been published for this course yet.
                </p>
            )}
        </section>
    );
}

/** Everything inside <main> for a loaded course. */
export function CourseContent({ course, courseId }) {
    const modules = Array.isArray(course.modules) ? course.modules : [];
    const prerequisites = Array.isArray(course.prerequisites) ? course.prerequisites : [];
    const level = levelMapping?.[course.level];
    const LevelIcon = LEVEL_ICON[course.level] || LuSignalLow;
    const { premium, label: priceLabel } = coursePrice(course);
    const rating = Number(course.rating || 0);
    const reviews = Number(course.reviews || 0);

    const stats = [
        { label: 'Chapters', value: modules.length },
        { label: 'Lessons', value: course.lessons ?? 0 },
        { label: 'Duration', value: formatDuration(course.duration) },
        { label: 'Students', value: Number(course.students ?? 0).toLocaleString('en-US') },
    ];

    return (
        <>
            {/* Course header */}
            <section aria-labelledby="course-title" className="flex flex-col gap-5">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-card">
                        <LanguageLogo src={course.language_logo} />
                    </span>
                    <p className="truncate tabular text-xs text-muted-foreground">
                        {[course.language_name, course.category_name].filter(Boolean).join(' / ') || 'General'}
                    </p>
                </div>

                <div className="space-y-3">
                    <h1 id="course-title" className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
                        {course.title}
                    </h1>
                    {course.concept && (
                        <ExpandableText clampClass="line-clamp-3" className="max-w-[70ch] text-base leading-relaxed text-muted-foreground">
                            {course.concept}
                        </ExpandableText>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {course.level && (
                        <Badge variant="outline" className="text-muted-foreground">
                            <LevelIcon aria-hidden="true" />
                            {level?.label || course.level}
                        </Badge>
                    )}
                    {premium ? (
                        <Badge variant="outline">
                            {priceLabel === 'Premium' ? 'Premium' : <>Premium · <span className="tabular">{priceLabel}</span></>}
                        </Badge>
                    ) : (
                        <Badge variant="success">Free</Badge>
                    )}
                    <Suspense fallback={null}>
                        <EnrollmentBadge courseId={courseId} />
                    </Suspense>
                    {/* The learners' average, sent only from 3 ratings on (migration 20261103_013). */}
                    {rating > 0 ? (
                        <span
                            className="ml-1 flex items-center gap-1 text-xs font-medium text-foreground tabular"
                            title={`Rated ${rating.toFixed(1)} out of 5`}
                        >
                            <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />
                            <span className="sr-only">Rating</span>
                            {rating.toFixed(1)}
                            {reviews > 0 && (
                                <span className="font-normal text-muted-foreground">({reviews.toLocaleString('en-US')} {reviews === 1 ? 'rating' : 'ratings'})</span>
                            )}
                        </span>
                    ) : (
                        <span className="ml-1 text-xs text-muted-foreground">No ratings yet</span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Suspense fallback={<ActionsSkeleton />}>
                        <CourseActions courseId={courseId} />
                    </Suspense>
                </div>

                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                    {stats.map((stat) => (
                        <div key={stat.label} className="bg-card px-4 py-3">
                            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                            <dd className="text-lg font-medium tabular">{stat.value}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
                {/* Course info, first on phones so it sits under the header */}
                {/* Tablets: cover and details side by side, so a full-width 16:9 cover does not push the course down. */}
                <aside className="grid items-start gap-4 sm:grid-cols-2 lg:order-last lg:sticky lg:top-16 lg:flex lg:flex-col lg:items-stretch lg:self-start" aria-label="Course information">
                    {course.image && <CourseCover src={course.image} />}

                    {/* Level, language, category and price are already in the header badges. */}
                    <div className="rounded-lg border bg-card">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <Avatar className="size-9">
                                <AvatarFallback className="bg-primary-soft tabular text-xs font-semibold text-primary-soft-foreground">
                                    {getInitials(course.instructor)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <h2 className="text-xs text-muted-foreground">Instructor</h2>
                                <p className="truncate text-sm font-semibold" title={course.instructor}>
                                    {course.instructor || 'Not assigned'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {prerequisites.length > 0 && (
                        // A list, not chips: long course titles wrap inside the card instead of overflowing the row.
                        <section aria-labelledby="course-prerequisites-heading" className="rounded-lg border bg-card px-4 py-3">
                            <h2 id="course-prerequisites-heading" className="text-xs text-muted-foreground">
                                Take these first
                            </h2>
                            <ul className="mt-2 flex list-none flex-col gap-1 p-0">
                                {prerequisites.map((item) => (
                                    <li key={item.id}>
                                        <Link
                                            href={`/course/${item.id}`}
                                            className="group/prereq flex items-start gap-1.5 rounded-sm py-1 text-sm font-medium text-foreground outline-none hover:text-primary-ink focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                        >
                                            <span className="min-w-0 flex-1 text-pretty">{item.title}</span>
                                            <LuChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover/prereq:translate-x-0.5" aria-hidden="true" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </aside>

                <div className="flex min-w-0 flex-col gap-10">
                    <section aria-labelledby="course-about-heading" className="space-y-3">
                        <h2 id="course-about-heading" className="text-base font-semibold">About this course</h2>
                        {course.description ? (
                            <ExpandableText clampClass="line-clamp-6" className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-line text-foreground">
                                {course.description}
                            </ExpandableText>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No description has been written for this course yet.
                            </p>
                        )}
                    </section>

                    <Syllabus modules={modules} />

                    <Suspense fallback={null}>
                        <CommentPage courseId={courseId} />
                    </Suspense>
                </div>
            </div>
        </>
    );
}

/** Fixed bottom bar on phones: title, price and the one live purchase action. */
export function CourseMobileBar({ course, courseId }) {
    const { premium, label: priceLabel } = coursePrice(course);
    return (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 shadow-md backdrop-blur-sm sm:hidden">
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{course.title}</p>
                <p className="text-xs text-muted-foreground">{premium ? priceLabel : 'Free course'}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
                <Suspense fallback={<Skeleton className="h-9 w-28" />}>
                    <MobilePurchaseActions courseId={courseId} />
                </Suspense>
            </div>
        </div>
    );
}

/** Page frame: top bar, main column and, on phones, the bottom bar. */
export function CoursePageFrame({ title, loading, children, mobileBar = null }) {
    return (
        <div className="flex min-h-full w-full flex-col bg-background">
            <CourseTopBar title={title} loading={loading} />
            <main className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-6 pb-24 sm:pb-12 sm:px-6 lg:pt-10">
                {children}
            </main>
            {mobileBar}
        </div>
    );
}
