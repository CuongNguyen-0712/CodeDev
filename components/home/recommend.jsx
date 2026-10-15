'use client';

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { courseQueries } from "@/queries/course.query";
import { levelMapping } from "@/constants/constants";

import { ErrorReload } from "../ui/error";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import {
    LuArrowRight,
    LuBookOpen,
    LuChevronLeft,
    LuChevronRight,
    LuClock,
    LuLayers,
    LuLibrary,
    LuRoute,
    LuStar,
} from "react-icons/lu";

const FALLBACK_IMAGE = "/image/static/no_image.png";
const CARD_WIDTH = "w-64 sm:w-72";

function handleImageError(e) {
    e.currentTarget.onerror = null;
    e.currentTarget.src = FALLBACK_IMAGE;
}

function CardSkeleton() {
    return (
        <li className={`${CARD_WIDTH} shrink-0`}>
            <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="flex flex-col gap-3 p-3.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-40" />
                    <div className="flex items-center justify-between border-t pt-3">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-5 w-20" />
                    </div>
                </div>
            </div>
        </li>
    );
}

function CourseCard({ item, onClickGuard }) {
    const level = levelMapping[item.level] || levelMapping["beginner"];
    const cost = Number(item.cost || 0);
    const point_price = Number(item.point_price || 0);

    const subtitle = [item.language_name, item.category_name].filter(Boolean).join(" / ");
    const stats = [
        item?.modules ? { Icon: LuLayers, value: item.modules, label: Number(item.modules) === 1 ? "module" : "modules" } : null,
        item?.lessons ? { Icon: LuBookOpen, value: item.lessons, label: Number(item.lessons) === 1 ? "lesson" : "lessons" } : null,
        item?.duration ? { Icon: LuClock, value: `${item.duration}m`, label: "total" } : null,
    ].filter(Boolean);

    return (
        <li className={`${CARD_WIDTH} shrink-0 snap-start`}>
            <Link
                href={`/course/${item.id}`}
                draggable={false}
                onClick={onClickGuard}
                className="group/card flex h-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground transition-colors outline-none hover:border-primary/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-accent/40"
            >
                <div className="aspect-video w-full overflow-hidden border-b bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={item.image || FALLBACK_IMAGE}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="block size-full object-cover"
                        onError={handleImageError}
                    />
                </div>

                <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-background">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={item.language_logo || FALLBACK_IMAGE}
                                alt=""
                                width={16}
                                height={16}
                                draggable={false}
                                className="size-4 object-contain"
                                onError={handleImageError}
                            />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                            {subtitle || "General"}
                        </span>
                        {item?.rating ? (
                            <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-foreground tabular">
                                <LuStar className="size-3.5 fill-current text-muted-foreground" aria-hidden="true" />
                                <span className="sr-only">Rating</span>
                                {item.rating}
                            </span>
                        ) : null}
                    </div>

                    <h3
                        className="line-clamp-2 text-sm leading-snug font-semibold text-foreground group-hover/card:text-primary"
                        title={item.title}
                    >
                        {item.title}
                    </h3>

                    {stats.length > 0 && (
                        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs text-muted-foreground">
                            {stats.map(({ Icon, value, label }) => (
                                <li key={label} className="flex items-center gap-1">
                                    <Icon className="size-3.5" aria-hidden="true" />
                                    <span className="font-mono text-foreground tabular">{value}</span>
                                    {label}
                                </li>
                            ))}
                        </ul>
                    )}

                    {item.instructor && (
                        <p className="truncate text-xs text-muted-foreground">
                            By <span className="text-foreground">{item.instructor}</span>
                        </p>
                    )}

                    <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                        {cost === 0 ? (
                            <Badge variant="success">Free</Badge>
                        ) : (
                            <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
                                <span className="font-mono text-sm font-semibold text-foreground tabular">
                                    ${cost.toFixed(2)}
                                </span>
                                {point_price > 0 && (
                                    <span className="truncate">
                                        or <span className="font-mono tabular">{point_price}</span> points
                                    </span>
                                )}
                            </span>
                        )}
                        <Badge variant="muted">{level.label}</Badge>
                    </div>
                </div>
            </Link>
        </li>
    );
}

export default function HomeRecommend() {
    const sliderRef = useRef(null);

    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    // Mouse drag-to-scroll state
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollStart, setScrollStart] = useState(0);
    const [hasDragged, setHasDragged] = useState(false);

    const {
        data,
        isLoading,
        isError,
        error,
        refetch
    } = useInfiniteQuery(courseQueries.list({ limit: 10, rating: ['5'] }));

    const courses = data?.pages.flatMap(page => page.data) || [];

    const checkScroll = () => {
        if (!sliderRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
        setCanScrollLeft(scrollLeft > 10);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    };

    useEffect(() => {
        checkScroll();
        const el = sliderRef.current;
        if (el) {
            el.addEventListener("scroll", checkScroll, { passive: true });
            window.addEventListener("resize", checkScroll);
            return () => {
                el.removeEventListener("scroll", checkScroll);
                window.removeEventListener("resize", checkScroll);
            };
        }
    }, [data, isLoading, isError]);

    const scroll = (direction) => {
        const el = sliderRef.current;
        if (!el) return;
        // Move by most of the visible width so one card stays in view for context.
        const scrollAmount = Math.max(240, el.clientWidth * 0.85);
        el.scrollBy({
            left: direction === "left" ? -scrollAmount : scrollAmount,
            behavior: "smooth"
        });
    };

    const handleMouseDown = (e) => {
        if (!sliderRef.current || e.button !== 0) return;
        setIsDragging(true);
        setHasDragged(false);
        setStartX(e.pageX - sliderRef.current.offsetLeft);
        setScrollStart(sliderRef.current.scrollLeft);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseMove = (e) => {
        if (!isDragging || !sliderRef.current) return;
        e.preventDefault();
        const x = e.pageX - sliderRef.current.offsetLeft;
        const walk = (x - startX) * 1.3;
        if (Math.abs(walk) > 5) {
            setHasDragged(true);
        }
        sliderRef.current.scrollLeft = scrollStart - walk;
    };

    // A drag that ends over a card must not open it.
    const handleClickGuard = (e) => {
        if (hasDragged) {
            e.preventDefault();
        }
    };

    const showEmpty = !isLoading && !isError && courses.length === 0;
    const showTrack = !isError && !showEmpty;

    return (
        <section
            id="home_recommend"
            aria-labelledby="home-featured-heading"
            className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1"
        >
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <h2 id="home-featured-heading" className="text-base font-semibold text-foreground">
                        Featured courses
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Top rated courses you are not enrolled in yet.
                    </p>
                </div>

                <div className="flex items-center gap-1">
                    {showTrack && (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                onClick={() => scroll("left")}
                                disabled={isLoading || !canScrollLeft}
                                aria-label="Scroll to previous courses"
                                aria-controls="home-featured-track"
                            >
                                <LuChevronLeft />
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                onClick={() => scroll("right")}
                                disabled={isLoading || !canScrollRight}
                                aria-label="Scroll to next courses"
                                aria-controls="home-featured-track"
                            >
                                <LuChevronRight />
                            </Button>
                        </>
                    )}
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/course">
                            All courses
                            <LuArrowRight />
                        </Link>
                    </Button>
                </div>
            </div>

            {isError ? (
                <ErrorReload
                    data={error || { status: 500, message: "Could not load recommendations" }}
                    refetch={refetch}
                />
            ) : showEmpty ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
                    <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <LuLibrary className="size-5" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">No featured courses right now</h3>
                        <p className="max-w-[48ch] text-sm text-muted-foreground">
                            You are already enrolled in every top rated course. Browse the catalog to find something new.
                        </p>
                    </div>
                    <Button asChild size="sm">
                        <Link href="/course">
                            <LuLibrary />
                            Browse courses
                        </Link>
                    </Button>
                </div>
            ) : (
                <ul
                    id="home-featured-track"
                    ref={sliderRef}
                    aria-label="Featured courses"
                    aria-busy={isLoading || undefined}
                    onMouseDown={handleMouseDown}
                    onMouseLeave={handleMouseLeave}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                    className={`m-0 flex list-none gap-3 overflow-x-auto overscroll-x-contain p-0 pb-3 [scrollbar-width:thin] ${isDragging ? "cursor-grabbing select-none" : "snap-x snap-mandatory"}`}
                >
                    {isLoading
                        ? Array.from({ length: 4 }, (_, index) => <CardSkeleton key={index} />)
                        : (
                            <>
                                {courses.map((item, index) => (
                                    <CourseCard
                                        key={item.id || index}
                                        item={item}
                                        onClickGuard={handleClickGuard}
                                    />
                                ))}

                                <li className={`${CARD_WIDTH} shrink-0 snap-start`}>
                                    <Link
                                        href="/course"
                                        draggable={false}
                                        onClick={handleClickGuard}
                                        className="flex h-full min-h-48 flex-col items-start justify-end gap-3 rounded-lg border border-dashed bg-card p-4 transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    >
                                        <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                            <LuLibrary className="size-4" aria-hidden="true" />
                                        </span>
                                        <span className="space-y-1">
                                            <span className="block text-sm font-semibold text-foreground">Browse the full catalog</span>
                                            <span className="block text-sm text-muted-foreground">
                                                Filter every course by level, price and rating.
                                            </span>
                                        </span>
                                        <span className="flex items-center gap-1 text-sm font-medium text-primary">
                                            All courses
                                            <LuArrowRight className="size-4" aria-hidden="true" />
                                        </span>
                                    </Link>
                                </li>
                            </>
                        )}
                </ul>
            )}

            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <LuRoute className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 space-y-0.5">
                        <h3 className="text-sm font-semibold text-foreground">Prefer a guided path?</h3>
                        <p className="text-sm text-muted-foreground">
                            Roadmaps put courses in order so you always know what to learn next.
                        </p>
                    </div>
                </div>
                <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
                    <Link href="/roadmap">
                        View roadmaps
                        <LuArrowRight />
                    </Link>
                </Button>
            </div>
        </section>
    );
}
