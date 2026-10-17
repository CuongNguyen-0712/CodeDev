'use client';

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { onboardingQueries } from "@/queries/premium.query";

import { ErrorReload } from "../ui/error";
import { RecommendationCard, RecommendationCardSkeleton } from "@/components/onboarding/recommendationCard";

import { Button } from "@/components/shadcn/button";

import {
    LuArrowRight,
    LuChevronLeft,
    LuChevronRight,
    LuLibrary,
    LuRoute,
    LuSlidersHorizontal,
} from "react-icons/lu";

const CARD_WIDTH = "w-64 sm:w-72";

function CardSkeleton() {
    return (
        <li className={`${CARD_WIDTH} shrink-0`}>
            <RecommendationCardSkeleton />
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

    const { status } = useSession();

    const {
        data,
        isLoading: isQueryLoading,
        isError,
        error,
        refetch
    } = useQuery(onboardingQueries.recommendations(status, 6));

    // Only used to pick where the "personalise" link goes (onboarding vs Settings).
    const { data: onboarding } = useQuery(onboardingQueries.status(status));

    const isLoading = status === "loading" || isQueryLoading;
    const items = Array.isArray(data?.items) ? data.items : [];
    const isFallback = Boolean(data?.fallback);
    const personaliseHref = onboarding?.status === "completed" ? "/settings#settings-preferences" : "/onboarding";

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

    const showEmpty = !isLoading && !isError && items.length === 0;
    const showTrack = !isError && !showEmpty;

    return (
        <section
            id="home_recommend"
            aria-labelledby="home-recommend-heading"
            className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1"
        >
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <h2 id="home-recommend-heading" className="text-base font-semibold text-foreground">
                        Recommended for you
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {isFallback
                            ? "Popular courses while we learn what you are looking for."
                            : "Picked from your role, experience level and goals."}
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
                                aria-controls="home-recommend-track"
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
                                aria-controls="home-recommend-track"
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

            {!isLoading && !isError && isFallback && (
                <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
                            <LuSlidersHorizontal className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 space-y-0.5">
                            <h3 className="text-sm font-semibold text-foreground">Personalise your recommendations</h3>
                            <p className="text-sm text-muted-foreground">
                                We could not match your profile yet. Tell us your role, level and goals to get courses picked for you.
                            </p>
                        </div>
                    </div>
                    <Button asChild size="sm" className="self-start sm:self-auto">
                        <Link href={personaliseHref}>
                            Personalise
                            <LuArrowRight />
                        </Link>
                    </Button>
                </div>
            )}

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
                        <h3 className="text-sm font-semibold text-foreground">No recommendations right now</h3>
                        <p className="max-w-[48ch] text-sm text-muted-foreground">
                            There is nothing new to suggest at the moment. Browse the catalog to find something to learn next.
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
                    id="home-recommend-track"
                    ref={sliderRef}
                    aria-label="Recommended courses"
                    aria-busy={isLoading || undefined}
                    onMouseDown={handleMouseDown}
                    onMouseLeave={handleMouseLeave}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                    className={`m-0 flex list-none gap-3 overflow-x-auto overscroll-x-contain p-0 pb-3 ${isDragging ? "cursor-grabbing select-none" : "snap-x snap-mandatory"}`}
                >
                    {isLoading
                        ? Array.from({ length: 4 }, (_, index) => <CardSkeleton key={index} />)
                        : (
                            <>
                                {items.map((item, index) => (
                                    <li key={item?.course?.id || index} className={`${CARD_WIDTH} shrink-0 snap-start`}>
                                        <RecommendationCard item={item} onClickGuard={handleClickGuard} />
                                    </li>
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
