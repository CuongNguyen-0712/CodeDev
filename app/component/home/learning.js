import { useState, useMemo } from "react";

import { useRouterActions } from "@/app/router/useRouterActions";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";

import { userQueries } from "@/app/query/user.query";

import { useSession } from "next-auth/react";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";

import { progressMapping } from "@/app/utils/constants";

import { FaAngleRight, FaAngleLeft, FaChartLine } from "react-icons/fa6";
import { HiSparkles } from "react-icons/hi2";

export default function HomeLearning() {
    const { navigate } = useRouterActions();
    const { status } = useSession();

    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false);

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.courseProgress(status, {}));

    const languageStats = useMemo(() => {
        const list = Array.isArray(data) ? data : [];

        const groupedLanguages = list
            .filter(item => item.status !== 'enrolled' && item.language_id)
            .reduce((acc, item) => {
                if (!acc[item.language_id]) {
                    acc[item.language_id] = {
                        language_name: item.language_name,
                        language_logo: item.language_logo,
                        language_color: item.language_color,
                        count: 1,
                    };
                } else {
                    acc[item.language_id].count++;
                }
                return acc;
            }, {});

        return Object.values(groupedLanguages);
    }, [data]);

    const courseProgress = useMemo(() => {
        const list = Array.isArray(data) ? data : [];

        const initialValue = Object.entries(progressMapping).reduce(
            (acc, [key, _]) => {
                acc[key] = {
                    count: 0,
                    courses: [],
                };

                return acc;
            },
            { total: 0 }
        );

        const progress = list.reduce((acc, item) => {
            acc.total++;

            const key = item.status;

            if (acc[key]) {
                acc[key].count++;

                acc[key].courses.push({
                    id: item.id,
                    title: item.title,
                    language_name: item.language_name,
                    language_logo: item.language_logo,
                    category_name: item.category_name,
                });
            }

            return acc;
        }, initialValue);

        return progress;
    }, [data]);

    return (
        <aside id="overview_sidebar">
            <section className="overview-analytics">
                <div className="overview-progress">
                    <div className="card-header">
                        {
                            target ?
                                <button onClick={() => setTarget(null)}>
                                    <FaAngleLeft />
                                    Back
                                </button>
                                :
                                <div className="header-title">
                                    <FaChartLine fontSize={35} />
                                    <span>
                                        <h5>
                                            Course Progress
                                        </h5>
                                        <p>
                                            {courseProgress.total} courses
                                        </p>
                                    </span>
                                </div>
                        }
                        <button onClick={() => navigate({ path: 'learning' })}>
                            View All
                            <FaAngleRight />
                        </button>
                    </div>
                    <div
                        className={`progress-content ${target ? 'active' : ''}`}
                        style={(isLoading || isError) ? { width: '100%' } : { width: '200%' }}
                    >
                        {isLoading ?
                            <LoadingContent scale={0.6} />
                            : isError ?
                                <ErrorReload data={error || { status: 500, message: "Something is wrong !" }} refetch={refetch} />
                                :
                                <div className="progress-list">
                                    {Object.values(progressMapping).map((item, index) => {
                                        return (
                                            <div
                                                className='progress-item'
                                                key={index}
                                                onClick={() => setTarget(item.value)}
                                            >
                                                <div className="progress-icon" style={{ color: item.color }}>
                                                    {item.icon}
                                                </div>
                                                <div className="progress-info">
                                                    <span className="progress-status" style={{ color: item.color }}>{item.label}</span>
                                                    <span className="progress-count">{courseProgress[item.value].count} courses</span>
                                                </div>
                                                <FaAngleRight fontSize={16} className="arrow" />
                                            </div>
                                        );
                                    })}
                                </div>
                        }
                        {
                            (!isLoading && !isError) &&
                            <div className='progress-detail'>
                                {courseProgress[target]?.count > 0 ?
                                    <div className='progress_detail_frame'>
                                        {courseProgress[target].courses.map((course, key) => (
                                            <Link
                                                href={`/course/${course.id}`}
                                                className="course-item"
                                                key={key}
                                            >
                                                <img src={course.language_logo || '/image/static/no_image.png'}
                                                    width={40}
                                                    height={40}
                                                    alt={course.language_name || 'course_logo'}
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = '/image/static/no_image.png';
                                                    }}
                                                />
                                                <div className="course-info">
                                                    <h5>{course.title}</h5>
                                                    <span>{course.category_name}</span>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                    :
                                    <p className="empty-state">No courses in this category</p>
                                }
                            </div>
                        }
                    </div>
                </div>
                <div className="overview-skills">
                    <div className="card-header">
                        <div className="header-title">
                            <HiSparkles fontSize={35} />
                            <span>
                                <h5>
                                    Language Skills
                                </h5>
                                <p>
                                    {languageStats.length} languages
                                </p>
                            </span>
                        </div>
                        <button onClick={() => setVisible(!visible)}>
                            {visible ? 'Collapse' : 'Expand'}
                            <FaAngleRight style={{ transform: visible ? 'rotate(90deg)' : 'rotate(0deg)' }} />
                        </button>
                    </div>
                    <div className="skills-content" style={{ maxHeight: visible ? '500px' : '200px' }}>
                        {languageStats.length > 0 ? (
                            languageStats.map((item, index) => (
                                <div className="skill-item" key={index}>
                                    <div className="skill-header">
                                        <img
                                            src={item.language_logo || '/image/static/no_image.png'}
                                            alt={item.language_name || 'icon_language'}
                                            width={20}
                                            height={20}
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = '/image/static/no_image.png';
                                            }}
                                        />
                                        <span className="skill-name">{item.language_name}</span>
                                        <span className="skill-percent">{((item.count / (courseProgress.in_progress.count + courseProgress.completed.count)) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="skill-bar">
                                        <div className="skill-progress" style={{ background: item.language_color, width: `${((item.count / (courseProgress.in_progress.count + courseProgress.completed.count)) * 100).toFixed(2)}%` }} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className='empty-state'>No language data available yet. Start learning to see your progress!</p>
                        )}
                    </div>
                </div>
            </section>
        </aside>
    )
}