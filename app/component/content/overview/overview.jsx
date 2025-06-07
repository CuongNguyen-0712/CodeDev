'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import Image from 'next/image';
import { LoadingContent } from '../../ui/loading';
import { ErrorReload } from '../../ui/error';
import { useQuery } from '@/app/router/router';
import { useSize } from '@/app/contexts/sizeContext';

import GetOverviewService from '@/app/services/getService/overviewService';
import GetInfoService from '@/app/services/getService/infoService';

import { FaAngleRight, FaCaretRight } from 'react-icons/fa6';

export default function Overview() {
    const queryNavigate = useQuery();
    const params = useSearchParams();

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
    })
    const { size } = useSize();

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
                    }
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
                }
            }))
            throw new Error(err);
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
                    }
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
                }
            }))
            throw new Error(err);
        }
    }

    const refetchData = () => {
        setState((prev) => ({ ...prev, data: { ...prev.data, data: [] } }));
        fetchData();
    }

    const refetchInfo = () => {
        setState((prev) => ({ ...prev, data: { ...prev.data, info: null } }));
        fetchInfo();
    }

    useEffect(() => {
        fetchData();
        fetchInfo();
    }, []);

    useEffect(() => {
        if (params.get('update')) {
            refetchInfo();
        }
    }, [params])

    const progressCourse = [
        { status: 'Enrolled', color: 'var(--color_red)' },
        { status: 'In Progress', color: 'var(--color_yellow)' },
        { status: 'Completed', color: 'var(--color_green)' },
    ];

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

    const languageStats = Object.values(groupedLanguages);

    return state.pending ? (
        <LoadingContent />
    ) : (
        <div id="overview">
            <div className="overview-container">
                <div className="overview-user">
                    {!state.data.info ?
                        <LoadingContent />
                        :
                        state.error.info || state.data.info.length === 0 ?
                            <ErrorReload data={state.error.info || { status: 500, message: "Something is wrong !" }} refetch={refetchInfo} />
                            :
                            <div className='user-container'>
                                <div className="user-info">
                                    <Image src={state.data.info.image} height={100} width={100} alt="avatar" priority />
                                    <div className="info">
                                        <div className="profile">
                                            <h2>{state.data.info.username}</h2>
                                            <span>{state.data.info.nickname || 'No nickname'}</span>
                                        </div>
                                        <div className="exprience">
                                            <p><span>Level</span><span>{state.data.info.level}</span></p>
                                            <p><span>Stars</span><span>{state.data.info.star}</span></p>
                                            <p><span>Rank</span><span>{state.data.info.rank}</span></p>
                                        </div>
                                    </div>
                                </div>
                                <button id="edit" onClick={() => queryNavigate(window.location.pathname, { manage: true })}>Edit profile</button>
                            </div>
                    }
                </div>

                <div className="language" style={{ height: visible && languageStats.length > 0 ? `${languageStats.length * 75 + (languageStats.length - 1) * 20 + 110}px` : '50px', transition: '0.2s all ease' }}>
                    <div className="header" onClick={() => setVisible(!visible)} style={visible ? { background: 'var(--color_black)', color: 'var(--color_white)' } : {}}>
                        <h5>Language Skill</h5>
                        <FaCaretRight style={{ transform: visible ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s all ease' }} />
                    </div>
                    <div className="main-language">
                        <div className="language-container">
                            {languageStats.length > 0 ? (
                                languageStats.map((item, index) => (
                                    <div className="language-item" key={index}>
                                        <div className="heading-language">
                                            <Image src={item.logo} alt="icon_language" width={25} height={25} />
                                            <h4>{item.id}</h4>
                                        </div>
                                        <div className="bar">
                                            <span style={{ background: item.color, width: `${((item.count / state.data.data.length) * 100).toFixed(2)}%` }} />
                                            <h5>{((item.count / state.data.data.length) * 100).toFixed(2)}%</h5>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p>No data, please join some courses</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="overview-container">
                <div className="course-progress">
                    <div className="main-progress">
                        {
                            !state.data.data ?
                                <LoadingContent />
                                :
                                state.error.data ?
                                    <ErrorReload data={state.error.data || { status: 500, message: "Something is wrong !" }} refetch={refetchData} />
                                    :
                                    <>
                                        <div className="progress-item">
                                            <div className="heading">
                                                <div className="title">
                                                    <h5>All course</h5>
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
                                                    <div className="detail" style={{ height: target === index ? `${filtered.length * (size.width <= 425 ? 110 : 75) + (filtered.length - 1) * 20 + 90}px` : '0px', padding: target === index ? '20px 10px' : '0 10px', transition: '0.2s all ease' }}>
                                                        <div className="info">
                                                            {filtered.length > 0 ? (
                                                                filtered.map((course, key) => (
                                                                    <div className="item" key={key}>
                                                                        <div className="header">
                                                                            <Image src={course.image} alt="image-course" width={30} height={30} />
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
                        <button onClick={() => queryNavigate('home', { target: '1', name: 'Course' })}>Open view my course</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
