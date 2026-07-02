'use client';
import { useEffect, useState, useMemo } from 'react';

import Link from 'next/link';

import { LoadingContent } from '../ui/loading';
import { ErrorReload } from '../ui/error';

import { useQuery } from '@/app/router/useQuery';
import { useRouterActions } from '@/app/router/useRouterActions';

import { api } from '@/app/lib/axios';

import { FaAngleRight, FaAngleLeft, FaStar, FaRankingStar, FaBook, FaGraduationCap, FaFire, FaChartLine } from 'react-icons/fa6';
import { HiSparkles } from 'react-icons/hi2';
import { MdEdit } from 'react-icons/md';

export default function Overview() {
    const queryNavigate = useQuery();
    const { navigate } = useRouterActions();

    const initialState = {
        data: {
            data: [],
            info: null,
        },
        error: {
            data: null,
            info: null,
        },
        load: {
            data: true,
            info: true
        }
    };

    const [state, setState] = useState(initialState);

    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false);

    const fetchData = async () => {
        setState((prev) => ({
            ...prev,
            load: {
                ...prev.load,
                data: true
            }
        }));

        try {
            const response = await api.get('/get/getOverview');

            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data : [];
                setState((prev) => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        data: data,
                    },
                    load: {
                        ...prev.load,
                        data: false
                    },
                }))
            }
            else {
                setState((prev) => ({
                    ...prev,
                    error: {
                        ...prev.error,
                        data:
                        {
                            status: response.status,
                            message: response.message ?? "Something is wrong !"
                        }
                    },
                    load: {
                        ...prev.load,
                        data: false
                    },
                }))
            }

        } catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    ...prev.error,
                    data: {
                        status: err.response?.status ?? 500,
                        message: err.response?.data?.message ?? err.message ?? "Something is wrong !"
                    }
                },
                load: {
                    ...prev.load,
                    data: false
                },
            }))
        }
    };

    const fetchInfo = async () => {
        setState((prev) => ({
            ...prev,
            load: {
                ...prev.load,
                info: true
            }
        }));

        try {
            const response = await api.get('/get/getInfo');
            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data[0] : null;
                setState((prev) => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        info: data,
                    },
                    load: {
                        ...prev.load,
                        info: false
                    },
                }))
            }
            else {
                setState((prev) => ({
                    ...prev,
                    error: {
                        ...prev.error,
                        info:
                        {
                            status: response.status,
                            message: response.message ?? "Something is wrong !"
                        }
                    },
                    load: {
                        ...prev.load,
                        info: false
                    },
                }))
            }
        }
        catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    ...prev.error,
                    info: {
                        status: err.response?.status ?? 500,
                        message: err.response?.data?.message ?? err.message ?? "Something is wrong !"
                    }
                },
                load: {
                    ...prev.load,
                    info: false
                },
            }))
        }
    }

    const refetchData = () => {
        setState((prev) => ({
            ...prev,
            data: {
                ...prev.data,
                data: []
            },
            error: {
                ...prev.error,
                data: null
            },
            load: {
                ...prev.load,
                data: true
            }
        }));
        fetchData();
    }

    const refetchInfo = () => {
        setState((prev) => ({
            ...prev,
            data: {
                ...prev.data,
                info: null
            },
            error: {
                ...prev.error,
                info: null
            },
            load: {
                ...prev.load,
                info: true
            }
        }));
        fetchInfo();
    }

    useEffect(() => {
        fetchData();
        fetchInfo();
    }, []);

    const progressMapping = {
        'enrolled': { status: 'Enrolled', value: 'enrolled', color: 'var(--color_primary)', icon: <FaBook /> },
        'in_progress': { status: 'In Progress', value: 'in_progress', color: 'var(--color_orange)', icon: <FaFire /> },
        'completed': { status: 'Completed', value: 'completed', color: 'var(--color_green)', icon: <FaGraduationCap /> },
    };

    const levelMapping = {
        'beginner': { label: 'Beginner', color: 'var(--color_white)' },
        'intermediate': { label: 'Intermediate', color: 'var(--color_yellow)' },
        'advanced': { label: 'Advanced', color: 'var(--color_red)' },
        'expert': { label: 'Expert', color: 'var(--color_purple)' },
        'master': { label: 'Master', color: 'var(--color_red_dark)' },
    };

    const languageStats = useMemo(() => {
        const list = Array.isArray(state.data?.data) ? state.data.data : [];

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
    }, [state.data]);

    const courseProgress = useMemo(() => {
        const list = Array.isArray(state.data?.data)
            ? state.data.data
            : [];

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
    }, [state.data?.data]);

    return (
        <div id="overview">
            <div id="overview_content">
                {/* Welcome Header */}
                <section className="overview-welcome">
                    {state.load.info ?
                        <LoadingContent color={'var(--color_white)'} />
                        : state.error.info ?
                            <ErrorReload data={state.error.info || { status: 500, message: "Something is wrong !" }} refetch={refetchInfo} />
                            :
                            <>
                                <div className="welcome-content">
                                    <div className="welcome-text">
                                        <span className="greeting">
                                            <HiSparkles />
                                            Welcome back
                                        </span>
                                        <h1>{state.data.info.username}</h1>
                                        <p>Track your progress and continue your learning journey</p>
                                    </div>
                                    <div className="welcome-avatar">
                                        <img
                                            src={state.data.info.image || '/image/static/no_image.png'}
                                            height={80}
                                            width={80}
                                            alt="avatar"
                                            priority="high"
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = '/image/static/no_image.png';
                                            }}
                                        />
                                        <button className="edit-btn" onClick={() => navigate('/profile')}>
                                            <MdEdit />
                                        </button>
                                    </div>
                                </div>
                                <div className="welcome-badges">
                                    <div className="badge level">
                                        <FaRankingStar />
                                        <span style={{ color: levelMapping[state.data.info.level]?.color || 'var(--color_white)' }}>
                                            {levelMapping[state.data.info.level]?.label || '__'}
                                        </span>
                                    </div>
                                    <div className="badge stars">
                                        <FaStar />
                                        <span>{state.data.info.star || 0} Stars</span>
                                    </div>
                                    <div className="badge rank">
                                        <FaChartLine />
                                        <span>Rank #{state.data.info.rank || 0}</span>
                                    </div>
                                </div>
                            </>
                    }
                </section>
            </div>
            <aside id="overview_sidebar">
                {/* Analytics */}
                <section className="overview-analytics">
                    {/* Course Progress */}
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
                            <button onClick={() => queryNavigate('home', { tab: 'learning' })}>
                                View All
                                <FaAngleRight />
                            </button>
                        </div>
                        <div
                            className={`progress-content ${target ? 'active' : ''}`}
                            style={(state.error.data || state.load.data) ? { width: '100%' } : { width: '200%' }}
                        >
                            {state.load.data ?
                                <LoadingContent scale={0.6} />
                                : state.error.data ?
                                    <ErrorReload data={state.error.data || { status: 500, message: "Something is wrong !" }} refetch={refetchData} />
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
                                                        <span className="progress-status" style={{ color: item.color }}>{item.status}</span>
                                                        <span className="progress-count">{courseProgress[item.value].count} courses</span>
                                                    </div>
                                                    <FaAngleRight fontSize={16} className="arrow" />
                                                </div>
                                            );
                                        })}
                                    </div>
                            }
                            {
                                (!state.load.data && !state.error.data) &&
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
                    {/* Language Skills */}
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
        </div>
    )
}
