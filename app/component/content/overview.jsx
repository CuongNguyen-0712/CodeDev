'use client';
import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

import Image from 'next/image';
import { LoadingContent } from '../ui/loading';
import { ErrorReload } from '../ui/error';
import { useQuery } from '@/app/router/router';

import GetOverviewService from '@/app/services/getService/overviewService';
import GetInfoService from '@/app/services/getService/infoService';

import { FaAngleRight, FaStar, FaRankingStar } from 'react-icons/fa6';

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
            const resData = await GetOverviewService();

            if (resData.status === 200) {
                setState((prev) => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        data: resData.data,
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
                            status: resData.status,
                            message: resData.message ?? "Something is wrong !"
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
                        status: 500,
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
            const resInfo = await GetInfoService();

            if (resInfo.status === 200) {
                setState((prev) => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        info: resInfo.data[0] ?? [],
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
                            status: resInfo.status,
                            message: resInfo.message ?? "Something is wrong !"
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
                        status: 500,
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

    useEffect(() => {
        if (params.get('update')) {
            fetchInfo();
            queryNavigate(pathname, { update: false });
        }
    }, [params])

    const progressCourse = [
        { status: 'Enrolled', color: 'var(--color_blue)' },
        { status: 'In Progress', color: 'var(--color_orange)' },
        { status: 'Completed', color: 'var(--color_green)' },
    ];

    const languageStats = useMemo(() => {
        const groupedLanguages = state.data.data.reduce((acc, item) => {
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

        return Object.values(groupedLanguages).sort((a, b) => b.count - a.count);
    }, [state.data.data])

    return state.pending ? (
        <LoadingContent />
    ) : (
        <div id="overview">
            <div className="overview-container">
                <div className="overview-user">
                    {(state.load.info && !state.error.info) ?
                        <LoadingContent />
                        :
                        state.error.info || !state.data.info ?
                            <ErrorReload data={state.error.info || { status: 500, message: "Something is wrong !" }} refetch={refetchInfo} />
                            :
                            <div className='user-container'>
                                <div className="user-info">
                                    <Image src={state.data.info.image.trim()} height={100} width={100} alt="avatar" priority />
                                    <div className="info">
                                        <div className="profile">
                                            <h2>{state.data.info.username}</h2>
                                            <span>{state.data.info.nickname || 'No nickname'}</span>
                                        </div>
                                        <div className="experience">
                                            <p className="level">{state.data.info.level}</p>
                                            <p>
                                                <span>
                                                    Stars
                                                </span>
                                                <span>
                                                    {state.data.info.star}
                                                    <FaStar fontSize={16} color='var(--color_yellow)' />
                                                </span>
                                            </p>
                                            <p>
                                                <span>
                                                    Rank
                                                </span>
                                                <span>
                                                    {state.data.info.rank}
                                                    <FaRankingStar fontSize={16} color='var(--color_orange)' />
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <button id="edit" onClick={() => queryNavigate(window.location.pathname, { manage: true })}>Edit profile</button>
                            </div>
                    }
                </div>

                <div className="language" style={languageStats.length > 0 ? { height: visible ? `${languageStats.length * 75 + (languageStats.length - 1) * 20 + 110}px` : '50px', transition: '0.2s all ease' } : { height: visible ? '150px' : '50px', transition: '0.2s all ease' }}>
                    <div className="header" onClick={() => setVisible(!visible)} style={visible ? { background: 'var(--color_black)', color: 'var(--color_white)' } : {}}>
                        <h5>Language Skill</h5>
                        <FaAngleRight style={{ transform: visible ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s all ease' }} />
                    </div>
                    <div className="main-language">
                        <div className="language-container">
                            {languageStats.length > 0 ? (
                                languageStats.map((item, index) => (
                                    <div className="language-item" key={index}>
                                        <div className="heading-language">
                                            <img src={item.logo?.trim()} alt="icon_language" />
                                            <h4>{item.id}</h4>
                                        </div>
                                        <div className="bar">
                                            <span style={{ background: item.color, width: `${((item.count / state.data.data.length) * 100).toFixed(2)}%` }} />
                                            <h5>{((item.count / state.data.data.length) * 100).toFixed(2)}%</h5>
                                        </div>
                                    </div>
                                ))
                            )
                                :
                                <p id='error_analyze'>No data to analyze</p>
                            }
                        </div>
                    </div>
                </div>
            </div>

            <div className="overview-container">
                <div className="course-progress">
                    <div className="main-progress">
                        {
                            (state.load.data && !state.error.data) ?
                                <LoadingContent scale={0.8} />
                                :
                                state.error.data ?
                                    <ErrorReload data={state.error.data || { status: 500, message: "Something is wrong !" }} refetch={refetchData} />
                                    :
                                    <>
                                        <div className="progress-item">
                                            <div className="heading">
                                                <div className="title">
                                                    <h4>All course</h4>
                                                    <p>{state.data.data.length}/{state.data.data.length}</p>
                                                </div>
                                            </div>
                                        </div>
                                        {progressCourse.map((item, index) => {
                                            const filtered = state.data.data.filter(course => course.status === item.status);
                                            return (
                                                <div className="progress-item" key={index}>
                                                    <div className="heading" onClick={() => setTarget(target === index ? null : index)} style={target === index ? { background: 'var(--color_black)', color: 'var(--color_white)' } : {}}>
                                                        <div className="title">
                                                            <span style={{ color: item.color }}>{item.status}</span>
                                                            <p>{filtered.length}/{state.data.data.length}</p>
                                                        </div>
                                                        <FaAngleRight style={{ opacity: target === index ? 1 : 0.5, transform: target === index ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s all ease' }} />
                                                    </div>
                                                    <div className="detail" style={{ height: target === index ? (filtered.length > 0 ? '400px' : '100px') : '0px', padding: target === index ? '20px' : '0px' }}>
                                                        <div className="info">
                                                            {filtered.length > 0 ? (
                                                                filtered.map((course, key) => (
                                                                    <div className="item" key={key}>
                                                                        <div className="header">
                                                                            <img src={course.image?.trim()} alt="course_image" />
                                                                            <h5>{course.title}</h5>
                                                                        </div>
                                                                        <span>{course.subject}</span>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <p id="no-course">No course can be shown</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                        }
                    </div>
                    <div className="footer">
                        <button onClick={() => queryNavigate('home', { name: 'course' })}>Open view my course</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
