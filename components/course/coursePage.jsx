'use client'
import { useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { courseQueries } from "@/queries/course.query";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useListQueryState } from "@/hooks/useListQueryState";
import { LEVELS } from "@/lib/listFilters";

import { ErrorReload } from "../ui/error";
import SearchBar from "../ui/searchBar";

import useInfiniteScroll from "@/hooks/useInfiniteScroll";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { CourseItem } from "./courseItem";

import { LuLibrary, LuLoaderCircle, LuSearchX } from "react-icons/lu";

// Static fields mirror the database (level_enum, access_model / commerce offers, rating 1..5 as a
// minimum); language, category, role, industry and skill options come from /api/course/filters
// (only ones that have courses; roles / industries / skills use their code as the value).
const STATIC_FILTERS = [
    {
        name: 'level',
        items: LEVELS.map((value) => ({ name: levelLabel(value), value })),
    },
    {
        name: 'price',
        items: [
            { name: 'Free', value: 'free' },
            { name: 'Premium', value: 'paid' },
            { name: 'Redeemable with points', value: 'points' },
            { name: 'Buy with money', value: 'money' },
        ]
    },
    {
        name: 'rating',
        items: [1, 2, 3, 4, 5].map((value) => ({ name: `${value}+ stars`, value: String(value) }))
    }
];

function levelLabel(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function CourseItemSkeleton() {
    return (
        <div className="flex flex-col gap-4 overflow-hidden rounded-lg border bg-card p-4" aria-hidden="true">
            <Skeleton className="-mx-4 -mt-4 aspect-video rounded-none" />
            <div className="flex items-start gap-3">
                <Skeleton className="size-9 rounded-md" />
                <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
            <div className="flex gap-1.5">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="h-12 w-full" />
            <div className="flex gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-20" />
            </div>
        </div>
    );
}

export default function CoursePage() {
    const { search, filter, params, isFiltered: hasActiveFilters, setSearch, setFilter, reset } = useListQueryState('course');

    const { status: sessionStatus } = useSession();
    const isSignedIn = sessionStatus === 'authenticated';

    const { data: filterOptions } = useQuery(courseQueries.filters());

    const filterFields = useMemo(() => {
        const toItems = (rows = []) => rows.map((row) => ({ name: row.name, value: row.id }));
        const dynamic = [
            { name: 'language', items: toItems(filterOptions?.languages) },
            { name: 'category', items: toItems(filterOptions?.categories) },
            { name: 'role', items: toItems(filterOptions?.roles) },
            { name: 'industry', items: toItems(filterOptions?.industries) },
            { name: 'skill', items: toItems(filterOptions?.skills) },
        ].filter((field) => field.items.length > 0);
        return [...STATIC_FILTERS, ...dynamic];
    }, [filterOptions]);

    const { data, isLoading, isError, isFetching, isPlaceholderData, fetchNextPage, hasNextPage, isFetchingNextPage, error, refetch } = useInfiniteQuery(
        courseQueries.list(params)
    );

    // While a new query loads, the previous results are only a placeholder: never page them.
    const { setRef } = useInfiniteScroll({
        hasMore: hasNextPage && !isPlaceholderData,
        isLoading: isFetchingNextPage,
        onLoadMore: () => {
            if (hasNextPage && !isPlaceholderData) {
                fetchNextPage();
            }
        },
    });

    const courses = data?.pages?.flatMap(page => page.data) ?? [];

    const showError = !isLoading && isError && courses.length === 0;
    // "0 courses" next to a load error reads as an empty catalog, so the count waits for real data.
    const countLabel = isLoading
        ? 'Loading courses...'
        : showError
            ? 'Courses unavailable'
            : `${courses.length}${hasNextPage ? '+' : ''} course${courses.length === 1 ? '' : 's'}`;
    const showEmpty = !isLoading && !isError && courses.length === 0;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Course catalog
                </h1>
                <p className="max-w-[60ch] text-sm text-muted-foreground">
                    Filter courses by level, price, rating, language, category, career role, industry or skill, then open one to review its syllabus.
                </p>
            </header>

            <section className="w-full" aria-label="Search and filter courses">
                <SearchBar
                    data={filterFields}
                    filter={filter}
                    search={search}
                    resultsCount={courses.length}
                    setSearch={setSearch}
                    setFilter={setFilter}
                    pending={isLoading || (isFetching && isPlaceholderData)}
                    placeholderText="Search courses by title or instructor..."
                />
            </section>

            <section aria-labelledby="course-list-heading" className="flex flex-col gap-3">
                {/* Clearing filters lives in the SearchBar chip row; the empty state offers it too. */}
                <h2 id="course-list-heading" className="flex min-h-8 items-center gap-2 text-sm font-medium text-foreground">
                    <LuLibrary className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span aria-live="polite">{countLabel}</span>
                </h2>

                {showError ? (
                    <ErrorReload data={error} refetch={refetch} />
                ) : showEmpty ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <LuSearchX className="size-5" aria-hidden="true" />
                        </span>
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold">
                                {hasActiveFilters
                                    ? 'No courses match these filters'
                                    : isSignedIn ? 'No new courses to show' : 'No courses available yet'}
                            </h3>
                            <p className="max-w-[48ch] text-sm text-muted-foreground">
                                {hasActiveFilters
                                    ? 'Clear the search or widen the filters to see more courses.'
                                    : isSignedIn
                                        ? 'The catalog hides courses you are already enrolled in. Continue those from My learning.'
                                        : 'New courses are published regularly. Check back soon to start learning.'}
                            </p>
                        </div>
                        {hasActiveFilters ? (
                            <Button variant="outline" size="sm" onClick={reset}>
                                Reset filters
                            </Button>
                        ) : isSignedIn && (
                            <Button asChild size="sm">
                                <Link href="/learning">Go to My learning</Link>
                            </Button>
                        )}
                    </div>
                ) : (
                    <ul className="grid list-none grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {isLoading
                            ? Array.from({ length: 6 }, (_, index) => (
                                <li key={index}><CourseItemSkeleton /></li>
                            ))
                            : courses.map((item, index) => (
                                <li key={item.id} className="animate-enter min-w-0" style={{ '--enter-index': index % 20 }}>
                                    <CourseItem item={item} />
                                </li>
                            ))}
                    </ul>
                )}

                <div ref={setRef} className="flex min-h-8 items-center justify-center text-xs text-muted-foreground">
                    {isFetchingNextPage ? (
                        <span className="flex items-center gap-2">
                            <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                            Loading more courses...
                        </span>
                    ) : isError && courses.length > 0 ? (
                        <span className="flex items-center gap-2">
                            {error?.message || 'Could not load more courses.'}
                            <Button variant="link" size="xs" onClick={() => fetchNextPage()}>
                                Try again
                            </Button>
                        </span>
                    ) : !hasNextPage && courses.length > 0 ? (
                        <span>End of the catalog</span>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
