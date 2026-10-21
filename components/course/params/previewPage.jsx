'use client'
import Link from "next/link";

import { ErrorReload } from "../../ui/error";

import FooterPreview from "./footerPreview";
import CommentPage from "./commentPage";
import { LEVEL_ICON, formatDuration } from "../courseItem";

import { useApp } from "@/contexts/appContext";
import { useSession } from "next-auth/react";
import { useRouterActions } from "@/router/useRouterActions";

import { useQuery } from "@tanstack/react-query";
import { courseQueries } from "@/queries/course.query";
import { useCourseFavorite, useCourseUnfavorite } from "@/mutations/course.mutation";

import { levelMapping } from "@/constants/constants";
import { fitCover } from "@/lib/coverFit";
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
import { Button } from "@/components/shadcn/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";
import { Separator } from "@/components/shadcn/separator";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";

import {
    LuArrowLeft,
    LuChevronRight,
    LuCirclePlay,
    LuCode,
    LuFileText,
    LuHeart,
    LuLibrary,
    LuLoaderCircle,
    LuSearchX,
    LuSignalLow,
    LuStar,
} from "react-icons/lu";

// Enrollment status is shown as a tinted badge with a text label, never colour alone.
const ENROLLMENT_STATUS = {
    enrolled: { label: 'Enrolled', variant: 'muted' },
    in_progress: { label: 'In progress', variant: 'primary' },
    completed: { label: 'Completed', variant: 'success' },
    paused: { label: 'Paused', variant: 'warning' },
    dropped: { label: 'Dropped', variant: 'destructive' },
};

// `content_type` also carries storage values such as "sanity" (rich text in the CMS),
// so only real lesson formats get a label; everything else reads as a written lesson.
const getLessonFormat = (type) => {
    const lower = String(type || '').toLowerCase();
    if (lower.includes('video')) return { Icon: LuCirclePlay, label: 'Video' };
    if (lower.includes('code') || lower.includes('exercise')) return { Icon: LuCode, label: 'Exercise' };
    if (lower.includes('quiz')) return { Icon: LuFileText, label: 'Quiz' };
    return { Icon: LuFileText, label: null };
};

// Covers are usually 16:9 photos, but some courses only have a square language
// logo (often SVG): cropping that to 16:9 cuts it apart, so it is fitted instead.
// Runs from the ref too, for an image the browser finished before hydration.
const getInitials = (name) => String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';

function HeaderSkeleton() {
    return (
        <div className="space-y-5" aria-hidden="true">
            <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-md" />
                <Skeleton className="h-3 w-40" />
            </div>
            <div className="space-y-3">
                <Skeleton className="h-9 w-3/4" />
                <Skeleton className="h-4 w-full max-w-xl" />
                <Skeleton className="h-4 w-2/3 max-w-md" />
            </div>
            <div className="flex gap-1.5">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-12" />
            </div>
            <div className="flex gap-2">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-9 w-28" />
            </div>
            <Skeleton className="h-16 w-full" />
            <div className="space-y-2 pt-6">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
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
                                                                <Badge variant="outline" className="tabular text-[10px] text-muted-foreground max-sm:hidden">
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

export default function PreviewPage({ params } = {}) {
    const { data, isLoading, error, refetch } = useQuery(courseQueries.details(params.id));

    const useFavorite = useCourseFavorite();
    const useUnfavorite = useCourseUnfavorite();

    const { showAlert: alert } = useApp();
    const { navigateBack } = useRouterActions();
    const { status: authStatus } = useSession();

    const handleSubmitFavorite = async () => {
        try {
            if (data?.is_favorite) {
                await useUnfavorite.mutateAsync({ courseId: params.id });
            } else {
                await useFavorite.mutateAsync({ courseId: params.id });
            }
        } catch (err) {
            alert(500, err?.message || "An unexpected error occurred, please try again later");
        }
    };

    const isFavorite = Boolean(data?.is_favorite);
    const isFavoritePending = useFavorite.isPending || useUnfavorite.isPending;

    const modules = Array.isArray(data?.modules) ? data.modules : [];
    const level = levelMapping?.[data?.level];
    const LevelIcon = LEVEL_ICON[data?.level] || LuSignalLow;
    // Prices live in commerce offers (catalog.course.cost is deprecated).
    const premium = isPremium(data);
    const { money, points } = offersOf(data);
    const priceLabel = [money && formatMoney(money.amountMinor, money.currency), points && formatPoints(points)]
        .filter(Boolean).join(' or ') || 'Premium';
    const rating = Number(data?.rating || 0);
    const reviews = Number(data?.reviews || 0);
    const enrollment = ENROLLMENT_STATUS[data?.status];

    const stats = [
        { label: 'Chapters', value: modules.length },
        { label: 'Lessons', value: data?.lessons ?? 0 },
        { label: 'Duration', value: formatDuration(data?.duration) },
        { label: 'Students', value: Number(data?.students ?? 0).toLocaleString('en-US') },
    ];

    return (
        <div className="flex min-h-full w-full flex-col bg-background">
            {/* Top bar */}
            <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" onClick={() => navigateBack('/course')} aria-label="Back to courses">
                            <LuArrowLeft />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Back to courses</TooltipContent>
                </Tooltip>

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
                            {isLoading ? (
                                <Skeleton className="h-4 w-40" />
                            ) : (
                                <BreadcrumbPage className="truncate font-medium" title={data?.title}>
                                    {data?.title || 'Course details'}
                                </BreadcrumbPage>
                            )}
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <main className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-6 pb-12 sm:px-6 lg:pt-10">
                {isLoading ? (
                    <HeaderSkeleton />
                ) : error ? (
                    <ErrorReload
                        data={error || { status: 500, message: "An unexpected error occurred, try again later" }}
                        refetch={() => refetch()}
                    />
                ) : !data ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <LuSearchX className="size-5" aria-hidden="true" />
                        </span>
                        <div className="space-y-1">
                            <h1 className="text-sm font-semibold">Course not found</h1>
                            <p className="max-w-[48ch] text-sm text-muted-foreground">
                                This course may have been removed or hidden. Pick another one from the catalog.
                            </p>
                        </div>
                        <Button asChild size="sm">
                            <Link href="/course"><LuLibrary />Browse courses</Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        {/* Course header */}
                        <section aria-labelledby="course-title" className="flex flex-col gap-5">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-card">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={data.language_logo || '/image/static/default.svg'}
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
                                <p className="truncate tabular text-xs text-muted-foreground">
                                    {[data.language_name, data.category_name].filter(Boolean).join(' / ') || 'General'}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <h1 id="course-title" className="text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
                                    {data.title}
                                </h1>
                                {data.concept && (
                                    <p className="max-w-[70ch] text-base leading-relaxed text-muted-foreground">
                                        {data.concept}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                                {data.level && (
                                    <Badge variant="outline" className="text-muted-foreground">
                                        <LevelIcon aria-hidden="true" />
                                        {level?.label || data.level}
                                    </Badge>
                                )}
                                {premium ? (
                                    <Badge variant="outline">
                                        {priceLabel === 'Premium' ? 'Premium' : <>Premium · <span className="tabular">{priceLabel}</span></>}
                                    </Badge>
                                ) : (
                                    <Badge variant="success">Free</Badge>
                                )}
                                {enrollment && <Badge variant={enrollment.variant}>{enrollment.label}</Badge>}
                                {/* Ratings run 1-5, so 0 means nobody has rated the course yet. */}
                                {rating > 0 ? (
                                    <span
                                        className="ml-1 flex items-center gap-1 text-xs font-medium text-foreground tabular"
                                        title={`Rated ${rating.toFixed(1)} out of 5`}
                                    >
                                        <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />
                                        <span className="sr-only">Rating</span>
                                        {rating.toFixed(1)}
                                        {reviews > 0 && (
                                            <span className="font-normal text-muted-foreground">({reviews.toLocaleString('en-US')} {reviews === 1 ? 'review' : 'reviews'})</span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="ml-1 text-xs text-muted-foreground">No ratings yet</span>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <FooterPreview
                                    courseId={params.id}
                                    status={data?.status ?? 'not_enrolled'}
                                    loading={isLoading}
                                />

                                {authStatus === 'authenticated' && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleSubmitFavorite}
                                        disabled={isFavoritePending}
                                        aria-pressed={isFavorite}
                                    >
                                        {isFavoritePending ? (
                                            <LuLoaderCircle className="animate-spin" aria-hidden="true" />
                                        ) : (
                                            <LuHeart className={isFavorite ? 'fill-destructive text-destructive' : undefined} aria-hidden="true" />
                                        )}
                                        {isFavorite ? 'Favorited' : 'Add to favorites'}
                                    </Button>
                                )}
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
                                {data.image && (
                                    // The frame owns the 16:9 box, so nothing shifts while the image loads.
                                    <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            ref={fitCover}
                                            src={data.image}
                                            alt=""
                                            decoding="async"
                                            className="size-full object-cover data-[fit=contain]:object-contain data-[fit=contain]:p-[10%]"
                                            onLoad={(e) => fitCover(e.currentTarget)}
                                            onError={(e) => {
                                                // A broken cover adds nothing; hide the frame instead of a placeholder.
                                                e.currentTarget.parentElement.hidden = true;
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Level, language, category and price are already in the header badges. */}
                                <div className="rounded-lg border bg-card">
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <Avatar className="size-9">
                                            <AvatarFallback className="bg-primary-soft tabular text-xs font-semibold text-primary-soft-foreground">
                                                {getInitials(data.instructor)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <h2 className="text-xs text-muted-foreground">Instructor</h2>
                                            <p className="truncate text-sm font-semibold" title={data.instructor}>
                                                {data.instructor || 'Not assigned'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </aside>

                            <div className="flex min-w-0 flex-col gap-10">
                                <section aria-labelledby="course-about-heading" className="space-y-3">
                                    <h2 id="course-about-heading" className="text-base font-semibold">About this course</h2>
                                    {data.description ? (
                                        <p className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-line text-foreground">
                                            {data.description}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            No description has been written for this course yet.
                                        </p>
                                    )}
                                </section>

                                <Syllabus modules={modules} />

                                <CommentPage courseId={params.id} />
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
