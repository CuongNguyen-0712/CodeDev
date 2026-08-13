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

import "@/app/style/home/learning.css";

export default function HomeLearning() {
    const { navigate } = useRouterActions();
    const { status } = useSession();

    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false);

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.overview(status));

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
                                            {data?.summary?.total} courses
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
                                    {data?.summary?.by_status && Object.entries(data.summary.by_status).filter(([status, _]) => progressMapping[status]).map(([status, count]) => {
                                        return (
                                            <div
                                                className='progress-item'
                                                key={status}
                                                onClick={() => setTarget(status)}
                                            >
                                                <div className="progress-icon" style={{ color: progressMapping[status]?.color }}>
                                                    {progressMapping[status]?.icon}
                                                </div>
                                                <div className="progress-info">
                                                    <span className="progress-status" style={{ color: progressMapping[status]?.color }}>{progressMapping[status]?.label}</span>
                                                    <span className="progress-count">{count} courses</span>
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
                                {data?.courses?.[target]?.length > 0 ?
                                    <div className='progress_detail_frame'>
                                        <>
                                            {data.courses[target].map((course, key) => (
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
                                            {
                                                data.courses[target].length > 10 &&
                                                <Link href={`/courses/${target}`} className="course-item more">
                                                    <span>More</span>
                                                </Link>
                                            }
                                        </>
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
                                    {data?.languages?.length || 0} languages
                                </p>
                            </span>
                        </div>
                        <button onClick={() => setVisible(!visible)}>
                            {visible ? 'Collapse' : 'Expand'}
                            <FaAngleRight style={{ transform: visible ? 'rotate(90deg)' : 'rotate(0deg)' }} />
                        </button>
                    </div>
                    <div className="skills-content" style={{ maxHeight: visible ? '500px' : '200px' }}>
                        {data?.languages?.length > 0 ? (
                            data.languages.map((item, index) => (
                                <div className="skill-item" key={index}>
                                    <div className="skill-header">
                                        <img
                                            src={item.logo || '/image/static/no_image.png'}
                                            alt={item.name || 'icon_language'}
                                            width={20}
                                            height={20}
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = '/image/static/no_image.png';
                                            }}
                                        />
                                        <span className="skill-name">{item.name}</span>
                                        <span className="skill-percent">{item.percentage}%</span>
                                    </div>
                                    <div className="skill-bar">
                                        <div className="skill-progress" style={{ background: item.color, width: `${item.percentage}%` }} />
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