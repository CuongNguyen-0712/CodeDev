'use client'
import { useState } from "react"

import Link from "next/link"

import { useRouterActions } from "@/app/router/useRouterActions";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import SearchBar from "../ui/searchBar";

import { useInfiniteQuery } from "@tanstack/react-query";
import { userQueries } from "@/app/query/user.query";

import { useSession } from "next-auth/react";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import LearningCourse from "./course";

import { FaCartShopping } from "react-icons/fa6";
import { LuSearchX } from "react-icons/lu";
import { HiSparkles } from "react-icons/hi2";

import "@/app/style/learning/learning.css";

export default function LearningPage() {
    const { navigate } = useRouterActions();

    const filterMapping = [
        {
            name: 'level',
            items: [
                {
                    name: 'Beginner',
                    value: 'beginner'
                },
                {
                    name: 'Intermediate',
                    value: 'intermediate'
                },
                {
                    name: 'Advanced',
                    value: 'advanced'
                },
                {
                    name: 'Expert',
                    value: 'expert'
                },
                {
                    name: 'Master',
                    value: 'master'
                }
            ]
        },
        {
            name: 'status',
            items: [
                {
                    name: 'Enrolled',
                    value: 'enrolled',
                },
                {
                    name: 'In Progress',
                    value: 'in_progress',
                },
                {
                    name: 'Completed',
                    value: 'completed',
                },
                {
                    name: 'Paused',
                    value: 'paused',
                },
                {
                    name: 'Dropped',
                    value: 'dropped',
                }
            ]
        },
    ]

    const defaultFilter = {
        status: ['enrolled', 'in_progress'],
    }

    const [state, setState] = useState({
        search: '',
        filter: {
            ...defaultFilter
        },
    })

    const { status } = useSession();

    const { data, isLoading, isPending, error, isError, refetch, hasNextPage, fetchNextPage } = useInfiniteQuery(userQueries.courseProgress(status, { ...state.filter, search: state.search }));

    const courses = data?.pages?.flatMap(page => page.data) || [];

    const { setRef } = useInfiniteScroll({
        hasMore: hasNextPage,
        onLoadMore: () => {
            if (hasNextPage) {
                fetchNextPage();
            }
        },
    })

    return (
        <div className="shared_section" id="learning">
            <div className="header-content">
                <div className="header-text">
                    <span className="header-label">
                        <HiSparkles />
                        <span>Learning</span>
                    </span>
                    <h1>My Learning</h1>
                    <p>Continue your learning journey and track progress</p>
                </div>
                <Link className="header-btn" id="marketplace_btn" href="/course">
                    <FaCartShopping />
                    <span>Courses Marketplace</span>
                </Link>
            </div>

            <section className="learning-search">
                <SearchBar
                    data={filterMapping}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    defaultFilter={defaultFilter}
                    pending={isPending}
                    placeholderText="Search..."
                />
            </section>

            <section className="learning-grid">
                {
                    isLoading ?
                        <LoadingContent />
                        :
                        !courses && isError ?
                            <ErrorReload data={error} refetch={refetch} />
                            : courses && courses.length > 0 ? (
                                courses.map(item => (
                                    <LearningCourse
                                        key={item.id}
                                        item={item}
                                    />
                                )))
                                :
                                <div className="empty-state">
                                    <LuSearchX />
                                    <h4>No courses found</h4>
                                    <p>Try adjusting your search or explore the marketplace</p>
                                    <button onClick={() => navigate({ path: 'course' })}>
                                        <FaCartShopping />
                                        Browse Marketplace
                                    </button>
                                </div>
                }
                {
                    hasNextPage &&
                    <div className="load-more-wrapper" ref={setRef}>
                        <LoadingContent
                            scale={0.6}
                            message={isError && (error?.message || "Something is wrong, check your connection")}
                        />
                    </div>
                }
            </section>
        </div>
    )
}