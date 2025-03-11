import { useEffect, useState } from "react";

import axios from "axios";
import Image from "next/image"
import { LoadingContent } from "../../ui/loading";
import { useQuery } from "@/app/router/router";

import { FaAngleRight, FaCaretRight } from "react-icons/fa6";

export default function Overview() {
    const queryNavigate = useQuery();

    const [pending, setPending] = useState(true)
    const [user, setUser] = useState()
    const [course, setCourse] = useState([])
    const [language, setLunguage] = useState([])

    const [error, setError] = useState({
        user: false,
        course: false,
        language: false
    })

    const fetchData = async () => {
        try {
            const resUser = await axios.get('/api/user');
            const resCourse = await axios.get('/api/myCourse');
            const resLanguage = await axios.get('/api/language');

            if (resUser.status === 200 && resCourse.status === 200) {
                setUser(resUser.data);
                setCourse(resCourse.data);
                setLunguage(resLanguage.data);
                setPending(false);
            }
        } catch (error) {
            throw new Error(error)
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    const progress_course = [
        {
            status: "Enrolled",
            color: "var(--color_red)",
        },
        {
            status: "In Progress",
            color: "var(--color_yellow)",
        },
        {
            status: "Completed",
            color: "var(--color_green)",
        }
    ];

    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false)

    return (
        <>
            {
                pending ?
                    < LoadingContent />
                    :
                    <div id="overview">
                        <div className="overview-container">
                            {user.map((item) => (
                                <div key={item.id} className="overview-user">
                                    <div className="user-container">
                                        <Image src={item.image} height={100} width={100} alt="avatar" priority />
                                        <div className="info">
                                            <div className="profile">
                                                <h2>{item.username}</h2>
                                                <span>{item.nickname ? item.nickname : 'No nickname'}</span>
                                            </div>
                                            <div className="exprience">
                                                <p>
                                                    <span>Level</span>
                                                    <span>{item.level}</span>
                                                </p>
                                                <p>
                                                    <span>Stars</span>
                                                    <span>{item.star}</span>
                                                </p>
                                                <p>
                                                    <span>Rank</span>
                                                    <span>{item.rank}</span>
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <button id='edit' onClick={() => queryNavigate(window.location.pathname, { manage: true })}>Edit profile</button>
                                </div>
                            ))}
                            <div className="course-progress">
                                <div className="main-progress">
                                    <div className="progress-item">
                                        <div className="heading">
                                            <div className="title">
                                                <h5>All course</h5>
                                                <p>{course.length}/{course.length}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {progress_course.map((item, index) => (
                                        <div className="progress-item" key={index}>
                                            <div className="heading" onClick={() => setTarget(index !== target ? index : null)} style={target === index ? { background: 'var(--color_black)', color: 'var(--color_white)' } : {}}>
                                                <div className='title'>
                                                    <span style={{ color: item.color }}>{item.status}</span>
                                                    <p>{course.filter(child => child.status === item.status).length}/{course.length}</p>
                                                </div>
                                                <FaAngleRight style={target === index ? { opacity: '1', transform: 'rotate(90deg)', transition: '0.2s all ease' } : { opacity: '0.5', transform: 'rotate(0deg)', transition: '0.2s all ease' }} />
                                            </div>
                                            <div className="detail" style={target === index ? { height: '150px', padding: '20px 10px', transition: '0.2s all ease' } : { height: '0px', padding: '0 10px', transition: '0.2s all ease' }}>
                                                <div className="info">
                                                    {course.filter(child => child.status === item.status).length > 0 ?
                                                        course.filter(child => child.status === item.status).map((item, index) => (
                                                            <div className="item" key={index}>
                                                                <div className="header">
                                                                    <Image src={item.image} alt='image-course' width={30} height={30} />
                                                                    <h5>{item.title}</h5>
                                                                </div>
                                                                <span>{item.subject}</span>
                                                            </div>
                                                        ))
                                                        :
                                                        <p id="no-course">No course can be shown</p>
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="footer">
                                    <button onClick={() => queryNavigate('home', { target: '1', name: 'Course' })}>Open view my course</button>
                                </div>
                            </div>
                        </div>
                        <div className="language" style={visible ? { height: '350px', transition: '0.2s all ease' } : { height: '50px', transition: '0.2s all ease' }}>
                            <div className='header' onClick={() => setVisible(!visible)} style={visible ? { background: 'var(--color_black)', color: 'var(--color_white)' } : {}}>
                                <h5>Language Skill</h5>
                                <FaCaretRight style={visible ? { transform: 'rotate(90deg)', transition: '0.2s all ease' } : { transform: 'rotate(0deg)', transition: '0.2s all ease' }} />
                            </div>
                            <div className="main-language">
                                <div className="language-container">
                                    {language.map((item, index) => {
                                        const count = course.filter(child => child.language === item.id).length;
                                        const percentage = (count / course.length) * 100;

                                        return count > 0 ? (
                                            <div className="language-item" key={item.status || index}>
                                                <div className="heading-language">
                                                    <Image src={item.image} alt="icon_language" width={25} height={25} />
                                                    <h4>{item.id}</h4>
                                                </div>
                                                <div className="bar">
                                                    <span style={{ background: item.color, width: `${percentage}%` }}></span>
                                                    <h5>{percentage.toFixed(2)}%</h5>
                                                </div>
                                            </div>
                                        ) : null;
                                    })}

                                </div>
                            </div>
                        </div>
                    </div>
            }
        </>
    )
}