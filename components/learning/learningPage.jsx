'use client'
import { useState, useMemo, useCallback } from "react"
import Link from "next/link"

import { ErrorReload } from "../ui/error";
import SearchBar from "../ui/searchBar";

import { useInfiniteQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";
import useInfiniteScroll from "@/hooks/useInfiniteScroll";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/shadcn/table";

import LearningCourse from "./course";

import { LuLibrary, LuLoaderCircle, LuSearchX, LuBookOpen } from "react-icons/lu";

const FILTER_MAPPING = [
    {
        name: 'level',
        items: [
            { name: 'Beginner', value: 'beginner' },
            { name: 'Intermediate', value: 'intermediate' },
            { name: 'Advanced', value: 'advanced' },
            { name: 'Expert', value: 'expert' },
            { name: 'Master', value: 'master' }
        ]
    },
    {
        name: 'status',
        items: [
            { name: 'Enrolled', value: 'enrolled' },
            { name: 'In Progress', value: 'in_progress' },
            { name: 'Completed', value: 'completed' },
            { name: 'Paused', value: 'paused' },
            { name: 'Dropped', value: 'dropped' }
        ]
    },
];

const DEFAULT_FILTER = {
    status: ['enrolled', 'in_progress'],
};

function RowSkeleton() {
    return (
        <TableRow className="hover:bg-transparent">
            <TableCell className="py-3 pl-4 lg:w-full lg:max-w-0">
                <div className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-md" />
                    <div className="space-y-1.5">
                        <Skeleton className="h-4 w-56 max-w-[50vw]" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                </div>
            </TableCell>
            <TableCell className="max-xl:hidden"><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell className="max-lg:hidden"><Skeleton className="h-5 w-20" /></TableCell>
            <TableCell className="max-lg:hidden"><Skeleton className="h-1.5 w-44" /></TableCell>
            <TableCell className="max-lg:hidden pr-4"><Skeleton className="ml-auto h-8 w-28" /></TableCell>
        </TableRow>
    );
}

export default function LearningPage() {
    const { status } = useSession();

    const [state, setState] = useState({
        search: '',
        filter: { ...DEFAULT_FILTER },
    });

    const isFiltered = Boolean(
        state.search ||
        (state.filter?.status && (
            state.filter.status.length !== DEFAULT_FILTER.status.length ||
            !DEFAULT_FILTER.status.every(s => state.filter.status.includes(s))
        )) ||
        state.filter?.level?.length
    );

    const resetFilters = useCallback(() => {
        setState({
            search: '',
            filter: { ...DEFAULT_FILTER },
        });
    }, []);

    const handleSearchChange = useCallback((value) => {
        setState(prev => (prev.search === value ? prev : { ...prev, search: value }));
    }, []);

    const handleFilterChange = useCallback((value) => {
        setState(prev => ({ ...prev, filter: value }));
    }, []);

    const queryParams = useMemo(() => ({
        ...state.filter,
        search: state.search?.trim() || '',
    }), [state.filter, state.search]);

    const {
        data,
        isLoading,
        isFetchingNextPage,
        error,
        isError,
        refetch,
        hasNextPage,
        fetchNextPage
    } = useInfiniteQuery(userQueries.courseProgress(status, queryParams));

    const courses = data?.pages?.flatMap(page => page?.data || []) || [];

    // The sentinel sits under the table, so the next page loads when the
    // user reaches the end of the list rather than whenever it is visible.
    const { setRef } = useInfiniteScroll({
        hasMore: hasNextPage,
        isLoading: isFetchingNextPage,
        onLoadMore: () => {
            if (hasNextPage) {
                fetchNextPage();
            }
        },
    });

    const showError = !isLoading && isError && courses.length === 0;
    const showEmpty = !isLoading && !isError && courses.length === 0;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        My learning
                    </h1>
                    <p className="max-w-[60ch] text-sm text-muted-foreground">
                        Pick up where you left off, track lesson progress and manage the courses you are enrolled in.
                    </p>
                </div>
                <Button asChild variant="outline" className="self-start sm:self-auto">
                    <Link href="/course">
                        <LuLibrary />
                        Browse courses
                    </Link>
                </Button>
            </header>

            <section className="w-full" aria-label="Search and filter courses">
                <SearchBar
                    data={FILTER_MAPPING}
                    filter={state.filter}
                    search={state.search}
                    resultsCount={courses.length}
                    setSearch={handleSearchChange}
                    setFilter={handleFilterChange}
                    defaultFilter={DEFAULT_FILTER}
                    pending={isLoading}
                    placeholderText="Search your courses..."
                />
            </section>

            <section aria-labelledby="learning-list-heading" className="flex flex-col gap-3">
                {/* Clearing filters lives in the SearchBar chip row; no second reset here. */}
                <h2 id="learning-list-heading" className="flex min-h-8 items-center gap-2 text-sm font-medium text-foreground">
                    <LuBookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span aria-live="polite">
                        {isLoading
                            ? 'Loading courses...'
                            : `${courses.length}${hasNextPage ? '+' : ''} course${courses.length === 1 ? '' : 's'}`}
                    </span>
                </h2>

                {showError ? (
                    <div className="rounded-lg border">
                        <ErrorReload data={error} refetch={refetch} />
                    </div>
                ) : showEmpty ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <LuSearchX className="size-5" aria-hidden="true" />
                        </span>
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold">
                                {isFiltered ? 'No courses match these filters' : 'You are not enrolled in any course yet'}
                            </h3>
                            <p className="max-w-[48ch] text-sm text-muted-foreground">
                                {isFiltered
                                    ? 'Clear the search or widen the status filter to see more of your courses.'
                                    : 'Enroll in a course from the catalog and it will show up here with your progress.'}
                            </p>
                        </div>
                        {isFiltered ? (
                            <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button>
                        ) : (
                            <Button asChild size="sm">
                                <Link href="/course"><LuLibrary />Browse courses</Link>
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-lg border bg-card">
                        <Table className="max-lg:block">
                            <TableHeader className="bg-muted/60 max-lg:sr-only">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="h-9 pl-4 text-xs font-medium text-muted-foreground">Course</TableHead>
                                    <TableHead className="h-9 text-xs font-medium text-muted-foreground max-xl:hidden">Level</TableHead>
                                    <TableHead className="h-9 text-xs font-medium text-muted-foreground">Status</TableHead>
                                    <TableHead className="h-9 text-xs font-medium text-muted-foreground">Lessons</TableHead>
                                    <TableHead className="h-9 pr-4 text-right text-xs font-medium text-muted-foreground">
                                        <span className="sr-only">Actions</span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="max-lg:block">
                                {isLoading
                                    ? Array.from({ length: 5 }, (_, index) => <RowSkeleton key={index} />)
                                    : courses.map(item => (
                                        <LearningCourse key={item.id} item={item} />
                                    ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                <div ref={setRef} className="flex min-h-8 items-center justify-center text-xs text-muted-foreground">
                    {isFetchingNextPage ? (
                        <span className="flex items-center gap-2">
                            <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                            Loading more courses...
                        </span>
                    ) : !hasNextPage && courses.length > 0 ? (
                        <span>End of your enrolled courses</span>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
