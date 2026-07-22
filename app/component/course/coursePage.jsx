'use client'
import { useState } from "react"

import Link from "next/link";

import { courseQueries } from "@/app/query/course.query";
import { useInfiniteQuery } from "@tanstack/react-query";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import SearchBar from "../ui/searchBar";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { CourseItem } from "./courseItem";

import { FaBookOpen } from "react-icons/fa";

export default function CoursePage() {
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
            name: 'price',
            items: [
                {
                    name: 'Free',
                    value: 'false'
                },
                {
                    name: 'Paid',
                    value: 'true'
                }
            ]
        },
        {
            name: 'rating',
            items: [
                {
                    name: '1',
                    value: '1'
                },
                {
                    name: '2',
                    value: '2'
                },
                {
                    name: '3',
                    value: '3'
                },
                {
                    name: '4',
                    value: '4'
                },
                {
                    name: '5',
                    value: '5'
                },
            ]
        }
    ]

    const defaultFilter = {
    }

    const [state, setState] = useState({
        filter: {
            ...defaultFilter
        },
        search: ''
    })

    const { data, isLoading, isError, fetchNextPage, hasNextPage, error, refetch } = useInfiniteQuery(courseQueries.list({ ...state.filter, search: state.search.trim() }))

    const { setRef } = useInfiniteScroll({
        hasMore: hasNextPage,
        onLoadMore: () => {
            if (hasNextPage) {
                fetchNextPage();
            }
        },
    });

    const courses = data?.pages?.flatMap(page => page.data) ?? [];

    return (
        <section id="course-marketplace">
            <div className="marketplace-header">
                <SearchBar
                    data={filterMapping}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    defaultFilter={defaultFilter}
                    pending={isLoading}
                    placeholderText="Search courses..."
                />
            </div>

            <div className="courses-grid">
                {isLoading ?
                    <LoadingContent />
                    :
                    isError ?
                        <ErrorReload data={error} refetch={refetch} />
                        :
                        courses && courses.length > 0 ? (
                            courses.map(item => (
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
                                <p>Please wait for the next update or try a different search</p>
                            </div>
                        )}
            </div>

            {hasNextPage && (
                <div className="load-more-wrapper" ref={setRef}>
                    <LoadingContent
                        scale={0.5}
                        message={isError && (error?.message || "Something is wrong, check your connection")}
                    />
                </div>
            )}
        </section>
    )
}