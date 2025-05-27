'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { LoadingContent } from '../../ui/loading';
import { useQuery } from '@/app/router/router';
import GetOverviewService from '@/app/services/getService/overviewService';
import GetInfoService from '@/app/services/getService/infoService';
import { FaAngleRight, FaCaretRight } from 'react-icons/fa6';

export default function Overview() {
    const queryNavigate = useQuery();

    const [pending, setPending] = useState(true);
    const [data, setData] = useState([]);
    const [info, setInfo] = useState([]);
    const [error, setError] = useState(null);

    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [resData, resInfo] = await Promise.all([
                    GetOverviewService('CD01'),
                    GetInfoService('CD01'),
                ]);

                if (resData.status === 200 && resInfo.status === 200) {
                    setData(resData.data);
                    setInfo(resInfo.data);
                } else {
                    setError('Failed to fetch data.');
                }
            } catch (err) {
                console.error(err);
                setError('Something went wrong.');
            } finally {
                setPending(false);
            }
        };

        fetchData();
    }, []);

    const progressCourse = [
        { status: 'Enrolled', color: 'var(--color_red)' },
        { status: 'In Progress', color: 'var(--color_yellow)' },
        { status: 'Completed', color: 'var(--color_green)' },
    ];

    const groupedLanguages = data.reduce((acc, item) => {
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

    return pending ? (
        <LoadingContent />
    ) : (
        <div id="overview">
            <div className="overview-container">
                <div className="overview-user">
                    {info.length > 0 ? (
                        info.map((item) => (
                            <div className='user-container' key={item.id}>
                                <div className="user-info">
                                    <Image src={item.image} height={100} width={100} alt="avatar" priority />
                                    <div className="info">
                                        <div className="profile">
                                            <h2>{item.username}</h2>
                                            <span>{item.nickname || 'No nickname'}</span>
                                        </div>
                                        <div className="exprience">
                                            <p><span>Level</span><span>{item.level}</span></p>
                                            <p><span>Stars</span><span>{item.star}</span></p>
                                            <p><span>Rank</span><span>{item.rank}</span></p>
                                        </div>
                                    </div>
                                </div>
                                <button id="edit" onClick={() => queryNavigate(window.location.pathname, { manage: true })}>Edit profile</button>
                            </div>
                        ))
                    ) : (
                        <button onClick={() => window.location.reload()}>Reload</button>
                    )}
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
                                            <span style={{ background: item.color, width: `${((item.count / data.length) * 100).toFixed(2)}%` }} />
                                            <h5>{((item.count / data.length) * 100).toFixed(2)}%</h5>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <>
                                    <p>No data, can you join some courses</p>
                                    <button></button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="overview-container">
                <div className="course-progress">
                    <div className="main-progress">
                        <div className="progress-item">
                            <div className="heading">
                                <div className="title">
                                    <h5>All course</h5>
                                    <p>{data.length}/{data.length}</p>
                                </div>
                            </div>
                        </div>
                        {progressCourse.map((item, index) => {
                            const filtered = data.filter(course => course.status === item.status);
                            return (
                                <div className="progress-item" key={index}>
                                    <div className="heading" onClick={() => setTarget(target === index ? null : index)} style={target === index ? { background: 'var(--color_black)', color: 'var(--color_white)' } : {}}>
                                        <div className="title">
                                            <span style={{ color: item.color }}>{item.status}</span>
                                            <p>{filtered.length}/{data.length}</p>
                                        </div>
                                        <FaAngleRight style={{ opacity: target === index ? 1 : 0.5, transform: target === index ? 'rotate(90deg)' : 'rotate(0deg)', transition: '0.2s all ease' }} />
                                    </div>
                                    <div className="detail" style={{ height: target === index ? `${filtered.length * 55 + (filtered.length - 1) * 20 + 90}px` : '0px', padding: target === index ? '20px 10px' : '0 10px', transition: '0.2s all ease' }}>
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
                    </div>
                    <div className="footer">
                        <button onClick={() => queryNavigate('home', { target: '1', name: 'Course' })}>Open view my course</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
