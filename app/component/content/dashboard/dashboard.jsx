import { useEffect, useState } from "react";

import Image from "next/image"
import axios from "axios";

import { SiCplusplus, SiJavascript, SiPhp } from "react-icons/si";
import { FaJava } from "react-icons/fa";

export default function Dashboard() {
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

    const course_enrolled = [
        {
            name: "Java Advanced",
            language: "Java",
            icon: <FaJava />,
            color: "#ED8B00",
        },
        {
            name: "Laravel Basic",
            language: "PHP",
            icon: <SiPhp />,
            color: "#4F5D95",
        }
    ]

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
        <>
            <div className="main-dashboard">
                <div className="overview">
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
                            <div className="progress-item">
                                <h4>All course</h4>
                                <span>12</span>
                            </div>
                            {progress_course.map((item, index) => (
                                <div className="progress-item" key={index}>
                                    <h4 style={{ color: item.color }}>{item.status}</h4>
                                    <span>{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="language">
                        <h3>Language</h3>
                        <div className="language-container">
                            {language_list.map((item, index) => (
                                <div className="language-item" key={index}>
                                    <div className="heading">
                                        <h4>
                                            {item.name}
                                        </h4>
                                        <span style={{ color: item.color }}>{item.icon}</span>
                                    </div>
                                    <div className="bar">
                                        <span style={{ background: item.color }}></span>
                                        <span>{item.percentage}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="course">
                    <div className="course-recently">
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
                                                    <span>
                                                        <span
                                                            style={{ display: 'flex', position: 'absolute', height: '100%', width: `${item.progress}%`, background: item.color, left: '0' }}
                                                        ></span>
                                                    </span>
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
                    <div className="course-enrolled">
                        <h3>Enrolled</h3>
                        <ul className="list-course">
                            {course_enrolled.map((item, index) => (
                                <li key={index} className="course-item">
                                    <div className="item">
                                        <span style={{ color: item.color }}>{item.icon}</span>
                                        <div className="info">
                                            <h4>{item.name}</h4>
                                            <span>
                                                <h4>Language: </h4>
                                                {item.language}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="course-btn">
                                        <button>
                                            Join course
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </>
    )
}