'use client';

import Link from "next/link";

import { levelMapping } from "@/constants/constants";
import { cn } from "@/lib/utils";
import { fitCover } from "@/lib/coverFit";

import { Badge } from "@/components/shadcn/badge";
import { Skeleton } from "@/components/shadcn/skeleton";

import {
    LuBookOpen,
    LuCircleCheck,
    LuClock,
    LuGem,
    LuInfo,
    LuLayers,
    LuSparkles,
    LuStar,
} from "react-icons/lu";

const FALLBACK_IMAGE = "/image/static/no_image.png";

function handleImageError(e) {
    e.currentTarget.onerror = null;
    e.currentTarget.src = FALLBACK_IMAGE;
}

function courseLevelLabel(level) {
    if (!level) return null;
    const key = String(level).toLowerCase();
    return levelMapping[key]?.label || key.charAt(0).toUpperCase() + key.slice(1);
}

/** Free / Premium and Owned badges for a recommended course. */
export function AccessBadges({ course, owned }) {
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            {owned && (
                <Badge variant="info">
                    <LuCircleCheck aria-hidden="true" />
                    Owned
                </Badge>
            )}
            {course?.accessModel === "premium" ? (
                <Badge variant="primary">
                    <LuGem aria-hidden="true" />
                    Premium
                </Badge>
            ) : (
                <Badge variant="success">Free</Badge>
            )}
        </span>
    );
}

/**
 * One recommendation: `item` = { course, score, reasons[], cautions[], owned }.
 * `compact` drops the cover image and the stats (used in narrow strips).
 * The card only links to the course page; nothing is bought from here.
 */
export function RecommendationCard({ item, compact = false, onClickGuard, maxReasons = 3, className }) {
    const course = item?.course || {};
    const reasons = Array.isArray(item?.reasons) ? item.reasons.slice(0, maxReasons) : [];
    const caution = Array.isArray(item?.cautions) ? item.cautions[0] : null;
    const level = courseLevelLabel(course.level);
    const subtitle = [course.languageName, course.categoryName].filter(Boolean).join(" / ");

    const stats = compact ? [] : [
        course.modules ? { Icon: LuLayers, value: course.modules, label: Number(course.modules) === 1 ? "module" : "modules" } : null,
        course.lessons ? { Icon: LuBookOpen, value: course.lessons, label: Number(course.lessons) === 1 ? "lesson" : "lessons" } : null,
        course.duration ? { Icon: LuClock, value: `${course.duration}m`, label: "total" } : null,
    ].filter(Boolean);

    return (
        <Link
            href={`/course/${course.id}`}
            draggable={false}
            onClick={onClickGuard}
            className={cn(
                "group/card flex h-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground transition-colors outline-none hover:border-primary/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-accent/40",
                className
            )}
        >
            {!compact && (
                <div className="aspect-video w-full overflow-hidden border-b bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        ref={fitCover}
                        src={course.image || FALLBACK_IMAGE}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="block size-full object-cover data-[fit=contain]:object-contain data-[fit=contain]:p-[12%]"
                        onLoad={(e) => fitCover(e.currentTarget)}
                        onError={handleImageError}
                    />
                </div>
            )}

            <div className={cn("flex flex-1 flex-col gap-2.5", compact ? "p-3" : "p-3.5")}>
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-background">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={course.languageLogo || FALLBACK_IMAGE}
                            alt=""
                            width={16}
                            height={16}
                            draggable={false}
                            className="size-4 object-contain"
                            onError={handleImageError}
                        />
                    </span>
                    <span className="min-w-0 flex-1 truncate tabular text-xs text-muted-foreground">
                        {subtitle || "General"}
                    </span>
                    {course.rating ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-foreground tabular">
                            <LuStar className="size-3.5 fill-current text-muted-foreground" aria-hidden="true" />
                            <span className="sr-only">Rating</span>
                            {course.rating}
                        </span>
                    ) : null}
                </div>

                <h3
                    className="line-clamp-2 text-sm leading-snug font-semibold text-foreground group-hover/card:text-primary-ink"
                    title={course.title}
                >
                    {course.title}
                </h3>

                {stats.length > 0 && (
                    <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs text-muted-foreground">
                        {stats.map(({ Icon, value, label }) => (
                            <li key={label} className="flex items-center gap-1">
                                <Icon className="size-3.5" aria-hidden="true" />
                                <span className="text-foreground tabular">{value}</span>
                                {label}
                            </li>
                        ))}
                    </ul>
                )}

                {reasons.length > 0 && (
                    <div className="space-y-1 rounded-md bg-muted/50 px-2.5 py-2">
                        <p className="flex items-center gap-1 text-xs font-medium text-foreground">
                            <LuSparkles className="size-3.5 text-primary-ink" aria-hidden="true" />
                            Why this course
                        </p>
                        <ul className="m-0 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                            {reasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {caution && (
                    <p className="flex items-start gap-1 text-xs text-warning">
                        <LuInfo className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                        <span>{caution}</span>
                    </p>
                )}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <AccessBadges course={course} owned={item?.owned} />
                    {level && <Badge variant="muted">{level}</Badge>}
                </div>
            </div>
        </Link>
    );
}

export function RecommendationCardSkeleton({ compact = false }) {
    return (
        <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card" aria-hidden="true">
            {!compact && <Skeleton className="aspect-video w-full rounded-none" />}
            <div className={cn("flex flex-col gap-3", compact ? "p-3" : "p-3.5")}>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-12 w-full" />
                <div className="flex items-center justify-between border-t pt-3">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                </div>
            </div>
        </div>
    );
}
