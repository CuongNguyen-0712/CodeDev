'use client'
import { useState, useMemo, useCallback } from "react"
import Link from "next/link"

import { useRouterActions } from "@/router/useRouterActions";
import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import SearchBar from "../ui/searchBar";

import { useInfiniteQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";
import useInfiniteScroll from "@/hooks/useInfiniteScroll";

import LearningCourse from "./course";

import { FaCartShopping } from "react-icons/fa6";
import { LuSearchX, LuBookOpen } from "react-icons/lu";
import { HiSparkles } from "react-icons/hi2";

import "@/styles/learning/learning.css";

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

export default function LearningPage() {
    const { navigate } = useRouterActions();
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

    const { setRef } = useInfiniteScroll({
        hasMore: hasNextPage,
        onLoadMore: () => {
            if (hasNextPage) {
                fetchNextPage();
            }
        },
    });

    return (
        <div className="shared_section" id="learning">
            <div className="learning-hero-banner">
                <div className="hero-content">
                    <span className="hero-badge">
                        <HiSparkles />
                        <span>My Learning</span>
                    </span>
                    <h1 className="hero-title">Continue Your Learning Journey</h1>
                    <p className="hero-subtitle">
                        Track your progress, resume ongoing courses, and master industry-standard software engineering skills.
                    </p>
                </div>
                <Link className="hero-marketplace-btn" href="/course">
                    <FaCartShopping />
                    <span>Courses Marketplace</span>
                </Link>
            </div>

            {/* Search and Filters */}
            <section className="learning-search">
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

            {/* Status Bar */}
            <div className="learning-status-bar">
                <div className="status-counter">
                    <LuBookOpen />
                    <span>
                        {isLoading ? "Loading courses..." : `${courses.length} course${courses.length === 1 ? '' : 's'} found`}
                    </span>
                </div>
                {isFiltered && (
                    <button className="reset-filter-btn" onClick={resetFilters}>
                        Reset Filters
                    </button>
                )}
            </div>

            {/* Course Grid */}
            <section className="learning-grid" ref={setRef}>
                {isLoading ? (
                    <div className="loading-wrapper">
                        <LoadingContent message="Loading your enrolled courses..." />
                    </div>
                ) : !courses || (isError && courses.length === 0) ? (
                    <div className="error-wrapper">
                        <ErrorReload data={error} refetch={refetch} />
                    </div>
                ) : courses && courses.length > 0 ? (
                    courses.map(item => (
                        <LearningCourse
                            key={item.id}
                            item={item}
                        />
                    ))
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon-wrap">
                            <LuSearchX />
                        </div>
                        <h4>No courses match your criteria</h4>
                        <p>
                            {isFiltered
                                ? "Try resetting your search query or adjusting your filters."
                                : "You haven't enrolled in any courses yet. Browse the marketplace to get started!"}
                        </p>
                        <div className="empty-actions">
                            {isFiltered ? (
                                <button className="btn-empty-reset" onClick={resetFilters}>
                                    Reset Filters
                                </button>
                            ) : (
                                <button className="btn-empty-browse" onClick={() => navigate({ path: '/course' })}>
                                    <FaCartShopping />
                                    <span>Browse Marketplace</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Pagination / Load More Section */}
            <div className="learning-pagination">
                {hasNextPage ?
                    isFetchingNextPage ?
                        <LoadingContent scale={0.4} color="var(--color-primary)" message="Loading more courses..." />
                        :
                        null
                    :
                    <span className="learning-end-text">
                        You&apos;ve reached the end of your enrolled courses
                    </span>
                }
            </div>
        </div>
    );
}