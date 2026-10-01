'use client';

import { useState } from "react";
import { useRouterActions } from "@/router/useRouterActions";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import { progressMapping } from "@/constants/constants";

import { FaAngleRight, FaAngleLeft, FaChartLine, FaBookOpen } from "react-icons/fa6";
import { HiSparkles } from "react-icons/hi2";

import "@/styles/home/learning.css";

export default function HomeLearning() {
    const { navigate } = useRouterActions();
    const { status } = useSession();

    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false);

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.overview(status));

    const coursesByStatus = data?.courses?.[target] || [];
    const targetStatusMeta = target ? progressMapping[target] : null;

    return (
        <aside id="overview_sidebar">
            <section className="overview-analytics">
                {/* 1. Learning Progress Card */}
                <div className="overview-progress">
                    <div className="card-header">
                        {target ? (
                            <div className="header-nav">
                                <button
                                    type="button"
                                    className="back-btn"
                                    onClick={() => setTarget(null)}
                                    aria-label="Back to status overview"
                                    title="Back"
                                >
                                    <FaAngleLeft />
                                </button>
                                <div className="header-title">
                                    <div
                                        className="status-pill-icon"
                                        style={{ color: targetStatusMeta?.color }}
                                    >
                                        {targetStatusMeta?.icon}
                                    </div>
                                    <span>
                                        <h5>{targetStatusMeta?.label || 'Courses'}</h5>
                                        <p>{coursesByStatus.length} {coursesByStatus.length === 1 ? 'course' : 'courses'}</p>
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="header-title">
                                <div className="header-icon">
                                    <FaChartLine />
                                </div>
                                <span>
                                    <h5>Course Progress</h5>
                                    <p>{data?.summary?.total ?? 0} courses</p>
                                </span>
                            </div>
                        )}
                        <button
                            type="button"
                            className="view-all-btn"
                            onClick={() => navigate({ path: 'learning' })}
                        >
                            <span>View All</span>
                            <FaAngleRight />
                        </button>
                    </div>

                    <div
                        className={`progress-content ${target ? 'active' : ''}`}
                        style={(isLoading || isError) ? { width: '100%' } : { width: '200%' }}
                    >
                        {isLoading ? (
                            <LoadingContent scale={0.6} />
                        ) : isError ? (
                            <ErrorReload
                                data={error || { status: 500, message: "Something is wrong !" }}
                                refetch={refetch}
                            />
                        ) : (
                            <div className="progress-list">
                                {data?.summary?.by_status &&
                                    Object.entries(data.summary.by_status)
                                        .filter(([s]) => progressMapping[s])
                                        .map(([s, count]) => {
                                            const meta = progressMapping[s];
                                            const isActive = target === s;
                                            return (
                                                <div
                                                    className={`progress-item ${isActive ? 'active' : ''}`}
                                                    key={s}
                                                    onClick={() => setTarget(s)}
                                                    role="button"
                                                    tabIndex={0}
                                                >
                                                    <div
                                                        className="progress-icon"
                                                        style={{ color: meta?.color }}
                                                    >
                                                        {meta?.icon}
                                                    </div>
                                                    <div className="progress-info">
                                                        <span
                                                            className="progress-status"
                                                            style={{ color: meta?.color }}
                                                        >
                                                            {meta?.label}
                                                        </span>
                                                        <span className="progress-count">
                                                            {count} {count === 1 ? 'course' : 'courses'}
                                                        </span>
                                                    </div>
                                                    <FaAngleRight className="arrow" />
                                                </div>
                                            );
                                        })}
                            </div>
                        )}

                        {!isLoading && !isError && (
                            <div className="progress-detail">
                                {coursesByStatus.length > 0 ? (
                                    <div className="progress_detail_frame">
                                        {coursesByStatus.map((course) => {
                                            const progressVal = Math.min(100, Math.max(0, Math.round(course.progress / course.total * 100) ?? 0));
                                            return (
                                                <Link
                                                    href={`/course/${course.id}`}
                                                    className="course-item"
                                                    key={course.id}
                                                >
                                                    <div className="course-header">
                                                        <div className="course-logo-wrap">
                                                            <img
                                                                src={course.language_logo || '/image/static/no_image.png'}
                                                                alt={course.language_name || 'course_logo'}
                                                                onError={(e) => {
                                                                    e.target.onerror = null;
                                                                    e.target.src = '/image/static/no_image.png';
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="course-info">
                                                            <h5>{course.title}</h5>
                                                            <div className="course-meta">
                                                                {course.category_name && (
                                                                    <span className="course-category">
                                                                        {course.category_name}
                                                                    </span>
                                                                )}
                                                                {course.language_name && (
                                                                    <span
                                                                        className="course-language-badge"
                                                                        style={{
                                                                            borderColor: course.language_color ? `${course.language_color}40` : undefined,
                                                                            color: course.language_color || 'inherit'
                                                                        }}
                                                                    >
                                                                        <span
                                                                            className="lang-dot"
                                                                            style={{ background: course.language_color || 'var(--color-primary)' }}
                                                                        />
                                                                        {course.language_name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="course-progress-section">
                                                        <div className="course-progress-header">
                                                            <span>Progress</span>
                                                            <span className="progress-pct">{progressVal}%</span>
                                                        </div>
                                                        <div className="course-progress-bar">
                                                            <div
                                                                className="course-progress-fill"
                                                                style={{
                                                                    width: `${progressVal}%`,
                                                                    background: targetStatusMeta?.color || 'var(--color-primary)'
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </Link>
                                            );
                                        })}

                                        {(data?.summary?.by_status?.[target] > 10) && (
                                            <Link href={`/learning`} className="more-courses">
                                                <span>View More Courses</span>
                                                <FaAngleRight />
                                            </Link>
                                        )}
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <div className="empty-icon">
                                            <FaBookOpen />
                                        </div>
                                        <p className="empty-title">No courses found</p>
                                        <p className="empty-desc">
                                            You don't have any {targetStatusMeta?.label?.toLowerCase() || ''} courses yet.
                                        </p>
                                        <button
                                            type="button"
                                            className="explore-btn"
                                            onClick={() => navigate({ path: 'learning' })}
                                        >
                                            Explore Courses
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. Skills Card */}
                <div className="overview-skills">
                    <div className="card-header">
                        <div className="header-title">
                            <div className="header-icon sparkles">
                                <HiSparkles />
                            </div>
                            <span>
                                <h5>Language Skills</h5>
                                <p>{data?.languages?.length || 0} languages</p>
                            </span>
                        </div>
                        {data?.languages?.length > 2 && (
                            <button
                                type="button"
                                className={`collapse-btn ${visible ? 'expanded' : ''}`}
                                onClick={() => setVisible(!visible)}
                            >
                                <span>{visible ? 'Collapse' : 'Expand'}</span>
                                <FaAngleRight />
                            </button>
                        )}
                    </div>

                    <div className={`skills-content ${visible ? 'expanded' : ''}`}>
                        {isLoading ? (
                            <LoadingContent scale={0.6} />
                        ) : isError ? (
                            <ErrorReload
                                data={error || { status: 500, message: "Something is wrong !" }}
                                refetch={refetch}
                            />
                        ) : data?.languages?.length > 0 ? (
                            data.languages.map((item, index) => (
                                <div className="skill-item" key={item.name || index}>
                                    <div className="skill-header">
                                        <div className="skill-logo-wrap">
                                            <img
                                                src={item.logo || '/image/static/no_image.png'}
                                                alt={item.name || 'icon_language'}
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = '/image/static/no_image.png';
                                                }}
                                            />
                                        </div>
                                        <div className="skill-title-wrap">
                                            <span className="skill-name">{item.name}</span>
                                            {item.total !== undefined && (
                                                <span className="skill-count">
                                                    {item.total} {item.total === 1 ? 'course' : 'courses'}
                                                </span>
                                            )}
                                        </div>
                                        <span className="skill-percent">{item.percentage}%</span>
                                    </div>
                                    <div className="skill-bar">
                                        <div
                                            className="skill-progress"
                                            style={{
                                                background: item.color || 'var(--color-primary)',
                                                width: `${item.percentage}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon">
                                    <HiSparkles />
                                </div>
                                <p className="empty-title">No language data yet</p>
                                <p className="empty-desc">
                                    Start learning courses to build your language skill tree!
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </aside>
    );
}