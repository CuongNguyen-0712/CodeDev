'use client'
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Image from "next/image"
import axios from "axios";

import { SiCplusplus, SiJavascript, SiPhp } from "react-icons/si";
import { FaJava } from "react-icons/fa";
import { FaAngleRight, FaCaretRight } from "react-icons/fa6";

export default function Overview() {
    const progress_course = [
        {
            status: "Enrolled",
            color: "var(--color_red)",
            quantity: "1/12",
        },
        {
            status: "In Progress",
            color: "var(--color_yellow)",
            quantity: "10/12",
        },
        {
            status: "Completed",
            color: "var(--color_green)",
            quantity: "1/12",
        }
    ];

    const courses = [
        {
            index: 0,
            image: '/image/golang.ico',
            name: "Golang Basic",
            progress: 0
        },
        {
            index: 1,
            image: '/image/reactjs.ico',
            name: 'React Basic',
            progress: 30
        },
        {
            index: 1,
            image: '/image/java.ico',
            name: "Java Basic",
            progress: 40
        },
        {
            index: 2,
            image: '/image/python.ico',
            name: "Python Basic",
            progress: 100
        }
    ]

    const course_recently = [
        {
            name: "Javascript Basic",
            language: "Javascript",
            status: "In Progress",
            progress: 25,
            icon: <SiJavascript />,
            color: "#F7DF1E",
        },
        {
            name: "C++ Basic",
            language: "C++",
            status: "Completed",
            icon: <SiCplusplus />,
            progress: 100,
            color: "#00599C",
        }
    ];

    const language_list = [
        {
            name: "C++",
            icon: <SiCplusplus />,
            color: "#00599C",
            percentage: "12.2%"
        },
        {
            name: "Java",
            icon: <FaJava />,
            color: "#ED8B00",
            percentage: "22.7%"
        },
        {
            name: "PHP",
            icon: <SiPhp />,
            color: "#4F5D95",
            percentage: "5.6%"
        },
        {
            name: "Javascript",
            icon: <SiJavascript />,
            color: "#F7DF1E",
            percentage: "45.3%"
        }
    ]

    const [course, setCourse] = useState([]);
    const [target, setTarget] = useState(null);
    const [visible, setVisible] = useState(false)
    const router = useRouter();

    useEffect(() => {
        try {
            const reponse = axios.get('/data/dataCourses.json');
            const data = reponse.data;
            setCourse(data);
        }
        catch {
            throw new Error("Fetch data error");
        }
    }, [])

    return (
        <div id="overview">
            <div className="overview-container">
                <div className="overview-info">
                    <Image src={"/"} height={100} width={100} alt="avatar" />
                    <div className="info">
                        <div className="profile">
                            <h2>CuongNguyen</h2>
                            <span>CuongCoder</span>
                        </div>
                        <div className="exprience">
                            <span>Level
                                <h4>Beginner</h4>
                            </span>
                            <span>Stars
                                <h4>100</h4>
                            </span>
                            <span>Rank
                                <h4> 156,232</h4>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="course-progress">
                    <div className="main-progress">
                        <div className="progress-item">
                            <div className="heading">
                                <div className="title">
                                    <h5>All course</h5>
                                    <p>12/12</p>
                                </div>
                            </div>
                        </div>
                        {progress_course.map((item, index) => (
                            <div className="progress-item" key={index}>
                                <div className="heading" onClick={() => setTarget(index !== target ? index : null)} style={target === index ? { background: 'var(--color_black)', color: 'var(--color_white)' } : {}}>
                                    <div className='title'>
                                        <span style={{ color: item.color }}>{item.status}</span>
                                        <p>{item.quantity}</p>
                                    </div>
                                    <FaAngleRight style={target === index ? { opacity: '1', transform: 'rotate(90deg)', transition: '0.2s all ease' } : { opacity: '0.5', transform: 'rotate(0deg)', transition: '0.2s all ease' }} />
                                </div>
                                <div className="detail" style={target === index ? { height: '150px', padding: '20px 10px', transition: '0.2s all ease' } : { height: '0px', padding: '0 10px', transition: '0.2s all ease' }}>
                                    <div className="info">
                                        {courses.filter(item => item.index === index).map((item, index) => (
                                            <div className="item" key={index}>
                                                <div className="header">
                                                    <Image src={item.image} alt='' width={30} height={30} />
                                                    <h5>{item.name}</h5>
                                                </div>
                                                <p>Progress: {item.progress}%</p>
                                                <button className="join-btn">
                                                    Join
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="footer" onClick={() => router.push('/home/course')}>
                        <button>Open view more course</button>
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
                        {language_list.map((item, index) => (
                            <div className="language-item" key={index}>
                                <div className="heading-language">
                                    <span style={{ color: item.color }}>{item.icon}</span>
                                    <h4>{item.name}</h4>
                                </div>
                                <div className="bar">
                                    <span style={{ background: item.color, width: item.percentage }}></span>
                                    <h5>{item.percentage}</h5>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div id="recently">
                <h3>Recently</h3>
                <ul className="list-course">
                    {course_recently.map((item, index) => (
                        <li key={index} className="course-item">
                            <div className="item">
                                <span style={{ color: item.color }}>{item.icon}</span>
                                <div className="info">
                                    <h4>{item.name}</h4>
                                    <span>
                                        <h4>Language: </h4>
                                        {item.language}
                                    </span>
                                    <span>
                                        <h4>Status: </h4>
                                        {item.status}
                                    </span>
                                    <div className="progress-bar">
                                        <h4>Progress: </h4>
                                        <div className='bar'>
                                            <p>
                                                <span style={{ width: `${item.progress}%`, background: item.color, }}></span>
                                            </p>
                                            <h5>{item.progress}%</h5>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="course-btn">
                                {item.progress !== 100 ?
                                    <button>
                                        Continue
                                    </button>
                                    :
                                    <button>
                                        Retake
                                    </button>
                                }
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}