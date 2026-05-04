'use client';
import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

import Image from 'next/image';
import { LoadingContent } from '../ui/loading';
import { ErrorReload } from '../ui/error';
import { useQuery } from '@/app/router/useQuery';

import { api } from '@/app/lib/axios';

import { FaAngleRight, FaStar, FaRankingStar, FaBook, FaGraduationCap, FaFire, FaChartLine } from 'react-icons/fa6';
import { HiSparkles } from 'react-icons/hi2';
import { MdEdit } from 'react-icons/md';

export default function Overview() {
    const queryNavigate = useQuery();
    const params = useSearchParams();
    const pathname = usePathname();

    const [state, setState] = useState({
        data: {
            data: [],
            info: null,
        },
        pending: true,
        error: {
            data: null,
            info: null,
        },
        load: {
            data: true,
            info: true
        }
    })

    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false);

    const fetchData = async () => {
        try {
            const response = await api.get('/get/getOverview');

            if (response.data.success) {
                const data = response.data.data || [];
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
                    pending: false,
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
                    pending: false,
                }))
            }

        } catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    ...prev.error,
                    data: {
                        status: err.status ?? 500,
                        message: err.message ?? "Something is wrong !"
                    }
                },
                load: {
                    ...prev.load,
                    data: false
                },
                pending: false,
            }))
        }
    };

    const fetchInfo = async () => {
        try {
            const response = await api.get('/get/getInfo');
            if (response.data.success) {
                const data = response.data.data[0] || [];
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
                    pending: false,
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
                    pending: false,
                }))
            }
        }
        catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    ...prev.error,
                    info: {
                        status: err.status ?? 500,
                        message: err.message ?? "Something is wrong !"
                    }
                },
                load: {
                    ...prev.load,
                    info: false
                },
                pending: false,
            }))
        }
    }

    const refetchData = () => {
        setState((prev) => ({ ...prev, data: { ...prev.data, data: [] }, error: { ...prev.error, data: null }, load: { ...prev, data: true } }));
        fetchData();
    }

    const refetchInfo = () => {
        setState((prev) => ({ ...prev, data: { ...prev.data, info: null }, error: { ...prev.error, info: null }, load: { ...prev, info: true } }));
        fetchInfo();
    }

    useEffect(() => {
        fetchInfo();
        fetchData();
    }, []);

    const progressCourse = [
        { status: 'Enrolled', color: 'var(--color_primary)', icon: <FaBook /> },
        { status: 'In Progress', color: 'var(--color_orange)', icon: <FaFire /> },
        { status: 'Completed', color: 'var(--color_green)', icon: <FaGraduationCap /> },
        { status: 'Cancelled', color: 'var(--color_red)', icon: <FaChartLine /> },
    ];

    const languageStats = useMemo(() => {
        const list = Array.isArray(state.data?.data) ? state.data.data : [];

        const groupedLanguages = list
            .filter(item => item.status === 'In Progress')
            .reduce((acc, item) => {
                if (!acc[item.language]) {
                    acc[item.language] = {
                        id: item.language,
                        logo: item.logo,
                        color: item.color,
                        count: 1,
                    };
                } else {
                    acc[item.language].count++;
                }
                return acc;
            }, {});

        return Object.values(groupedLanguages);
    }, [state.data]);

    const stats = useMemo(() => {
        const list = Array.isArray(state.data?.data) ? state.data.data : [];

        return list.reduce(
            (acc, c) => {
                acc.total++;

                if (c.status === 'In Progress') acc.inProgress++;
                if (c.status === 'Completed') acc.completed++;

                return acc;
            },
            { total: 0, inProgress: 0, completed: 0 }
        );
    }, [state.data?.data]);

    return state.pending ? (
        <LoadingContent />
    ) : (
        <div id="overview">
            {/* Welcome Header */}
            <section className="overview-welcome">
                {(state.load.info && !state.error.info) ? (
                    <LoadingContent scale={0.6} />
                ) : state.error.info || !state.data.info ? (
                    <ErrorReload data={state.error.info || { status: 500, message: "Something is wrong !" }} refetch={refetchInfo} />
                ) : (
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
                                <Image src={state.data.info.image || '/image/static/default.svg'} height={80} width={80} alt="avatar" priority />
                                <button className="edit-btn" onClick={() => queryNavigate(window.location.pathname, { manage: true })}>
                                    <MdEdit />
                                </button>
                            </div>
                        </div>
                        <div className="welcome-badges">
                            <div className="badge level">
                                <FaRankingStar />
                                <span>{state.data.info.level}</span>
                            </div>
                            <div className="badge stars">
                                <FaStar />
                                <span>{state.data.info.star} Stars</span>
                            </div>
                            <div className="badge rank">
                                <FaChartLine />
                                <span>Rank #{state.data.info.rank}</span>
                            </div>
                        </div>
                    </>
                )}
            </section>

            {/* Quick Stats */}
            <section className="overview-stats">
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #3066be, #119da4)' }}>
                        <FaBook />
                    </div>
                    <div className="stat-info">
                        <span>Total Courses</span>
                        <h3>{stats.total}</h3>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
                        <FaFire />
                    </div>
                    <div className="stat-info">
                        <span>In Progress</span>
                        <h3>{stats.inProgress}</h3>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                        <FaGraduationCap />
                    </div>
                    <div className="stat-info">
                        <span>Completed</span>
                        <h3>{stats.completed}</h3>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #119da4, #80ded9)' }}>
                        <HiSparkles />
                    </div>
                    <div className="stat-info">
                        <span>Languages</span>
                        <h3>{languageStats.length}</h3>
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <section className="overview-main">
                {/* Language Skills */}
                <div className="overview-skills">
                    <div className="card-header">
                        <h3>
                            <HiSparkles />
                            Language Skills
                        </h3>
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
                                        <img src={item.logo?.trim()} alt="icon_language" />
                                        <span className="skill-name">{item.id}</span>
                                        <span className="skill-percent">{((item.count / stats.inProgress) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="skill-bar">
                                        <div className="skill-progress" style={{ background: item.color, width: `${((item.count / stats.inProgress) * 100).toFixed(2)}%` }} />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className='empty-state'>No language data available yet. Start learning to see your progress!</p>
                        )}
                    </div>
                </div>

                {/* Course Progress */}
                <div className="overview-progress">
                    <div className="card-header">
                        <h3>
                            <FaChartLine />
                            Course Progress
                        </h3>
                        <button onClick={() => queryNavigate('home', { tab: 'learning' })}>
                            View All
                            <FaAngleRight />
                        </button>
                    </div>
                    <div className="progress-content">
                        {(state.load.data && !state.error.data) ? (
                            <LoadingContent scale={0.6} />
                        ) : state.error.data ? (
                            <ErrorReload data={state.error.data || { status: 500, message: "Something is wrong !" }} refetch={refetchData} />
                        ) : (
                            <div className="progress-list">
                                {progressCourse.map((item, index) => {
                                    const list = Array.isArray(state.data?.data) ? state.data.data : [];
                                    const filtered = list.filter(course => course.status === item.status);

                                    return (
                                        <div className={`progress-item ${target === index ? 'active' : ''}`} key={index}>
                                            <div className="progress-header" onClick={() => setTarget(target === index ? null : index)}>
                                                <div className="progress-icon" style={{ color: item.color }}>
                                                    {item.icon}
                                                </div>
                                                <div className="progress-info">
                                                    <span className="progress-status" style={{ color: item.color }}>{item.status}</span>
                                                    <span className="progress-count">{filtered.length} courses</span>
                                                </div>
                                                <FaAngleRight className="arrow" />
                                            </div>
                                            <div className="progress-detail">
                                                {filtered.length > 0 ? (
                                                    filtered.map((course, key) => (
                                                        <div className="course-item" key={key}>
                                                            <img src={course.image?.trim()} alt="course" />
                                                            <div className="course-info">
                                                                <h5>{course.title}</h5>
                                                                <span>{course.subject}</span>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="empty-state">No courses in this category</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
