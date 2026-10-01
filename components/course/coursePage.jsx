'use client'
import { useState } from "react";

import { courseQueries } from "@/queries/course.query";
import { useInfiniteQuery } from "@tanstack/react-query";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import SearchBar from "../ui/searchBar";

import useInfiniteScroll from "@/hooks/useInfiniteScroll";

import { CourseItem } from "./courseItem";

import { FaBookOpen } from "react-icons/fa";
import { LuSparkles } from "react-icons/lu";

import "@/styles/course/course.css";

export default function CoursePage() {
    const filterMapping = [
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
            name: 'price',
            items: [
                { name: 'Free', value: 'false' },
                { name: 'Paid', value: 'true' }
            ]
        },
        {
            name: 'rating',
            items: [
                { name: '1 Star', value: '1' },
                { name: '2 Stars', value: '2' },
                { name: '3 Stars', value: '3' },
                { name: '4 Stars', value: '4' },
                { name: '5 Stars', value: '5' }
            ]
        }
    ];

    const defaultFilter = {};

    const [state, setState] = useState({
        filter: {
            ...defaultFilter
        },
        search: ''
    });

    const hasActiveFilters = Boolean(
        state.search.trim() ||
        Object.values(state.filter).some(val => Array.isArray(val) ? val.length > 0 : Boolean(val))
    );

    const { data, isLoading, isError, fetchNextPage, hasNextPage, error, refetch } = useInfiniteQuery(
        courseQueries.list({ ...state.filter, search: state.search.trim() })
    );

    const { setRef } = useInfiniteScroll({
        hasMore: hasNextPage,
        onLoadMore: () => {
            if (hasNextPage) {
                fetchNextPage();
            }
        },
    });

    const courses = data?.pages?.flatMap(page => page.data) ?? [];

    const handleClearFilters = () => {
        setState({
            filter: {},
            search: ''
        });
    };

    return (
        <section className='shared_section' id="course">
            {/* Hero Header */}
            <div className="course-hero-banner">
                <div className="hero-badge">
                    <LuSparkles fontSize={14} />
                    <span>Interactive Learning</span>
                </div>
                <h1 className="hero-title">Explore Courses</h1>
                <p className="hero-subtitle">
                    Master in-demand programming skills with hands-on projects, automated exercises, and structured career paths.
                </p>
            </div>

            {/* Search and Filters Bar */}
            <div className="course_header">
                <SearchBar
                    data={filterMapping}
                    filter={state.filter}
                    search={state.search}
                    resultsCount={courses.length}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    defaultFilter={defaultFilter}
                    pending={isLoading}
                    placeholderText="Search courses, technologies, instructors..."
                />
            </div>

            {/* Status bar */}
            {!isLoading && !isError && (
                <div className="courses-status-bar">
                    <span className="course-count">
                        Showing <strong>{courses.length}</strong> {courses.length === 1 ? 'course' : 'courses'}
                    </span>
                    {hasActiveFilters && (
                        <button
                            type="button"
                            className="clear-filters-link"
                            onClick={handleClearFilters}
                        >
                            Reset all filters
                        </button>
                    )}
                </div>
            )}

            {/* Courses Grid */}
            <div className="courses-grid">
                {isLoading ? (
                    <div className="courses-loading-wrapper">
                        <LoadingContent />
                    </div>
                ) : isError ? (
                    <div className="courses-error-wrapper">
                        <ErrorReload data={error} refetch={refetch} />
                    </div>
                ) : courses && courses.length > 0 ? (
                    courses.map((item) => (
                        <CourseItem
                            key={item.id}
                            item={item}
                        />
                    ))
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <FaBookOpen />
                        </div>
                        <h3>No courses found</h3>
                        <p>
                            {hasActiveFilters
                                ? "We couldn't find any courses matching your criteria. Try adjusting your search query or reset your filters."
                                : "No courses are currently available. Please check back soon!"}
                        </p>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                className="empty-reset-btn"
                                onClick={handleClearFilters}
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Pagination / Infinite Scroll Loader */}
            {hasNextPage && (
                <div className="load-more-wrapper" ref={setRef}>
                    <LoadingContent
                        scale={0.6}
                        message={isError && (error?.message || "Something went wrong, please check your connection")}
                    />
                </div>
            )}
        </section>
    );
}