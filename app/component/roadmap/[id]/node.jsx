'use client';
import { useState, useRef, useEffect } from 'react';

import Link from 'next/link';

import { FaChevronRight, FaChevronLeft, FaBookOpen } from 'react-icons/fa';

export default function Node({ data, handleNodeClick }) {
    const { title, description, order_index, courses } = data;

    const [currentCourseIndex, setCurrentCourseIndex] = useState(0);
    const [width, setWidth] = useState(0);

    const elementRef = useRef(null);

    const handlePrevCourse = () => {
        setCurrentCourseIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : courses.length - 1));
    };

    const handleNextCourse = () => {
        setCurrentCourseIndex((prevIndex) => (prevIndex < courses.length - 1 ? prevIndex + 1 : 0));
    };

    useEffect(() => {
        const updateSize = () => {
            if (elementRef.current) {
                setWidth(elementRef.current.offsetWidth);
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);

        return () => {
            window.removeEventListener('resize', updateSize);
        };
    }, []);

    return (
        <div className="node" onClick={handleNodeClick}>
            <div className="node_line">
                <span className="circle">
                    {order_index}
                </span>
                <span className="line"></span>
            </div>
            <div className="node_content">
                <div className="node_header">
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>

                <div className="suggested_courses_section">
                    <h4 className="suggested_courses_title">
                        <FaBookOpen /> Suggested Courses
                    </h4>
                    <div className="suggested_courses_navigation">
                        <button onClick={handlePrevCourse} title="Previous Course">
                            <FaChevronLeft />
                        </button>
                        {courses.length > 0 && (
                            <div className="suggested_courses_list" ref={elementRef}>
                                <div className="suggested_courses_frame" style={{ transform: `translateX(-${currentCourseIndex * width}px)` }}>
                                    {courses.map((course, idx) => (
                                        <Link
                                            key={idx}
                                            className={`suggested_course_card ${course.priority === 0 ? 'core' : 'recommended'}`}
                                            style={{ width: width - 20 + 'px' }}
                                            href={`/course/${course.id}`}
                                        >
                                            <img
                                                src={course.image || '/image/static/no_image.png'}
                                                alt={course.title}
                                                width={width - 40}
                                                height={200}
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = '/image/static/no_image.png';
                                                }}
                                            />
                                            <div className="course_details">
                                                <div className="course_header">
                                                    <img
                                                        src={course.logo || '/image/static/no_image.png'}
                                                        alt={course.language}
                                                        width={50}
                                                        height={50}
                                                        onError={(e) => {
                                                            e.target.onerror = null;
                                                            e.target.src = '/image/static/no_image.png';
                                                        }}
                                                    />
                                                    <div className="course_info">
                                                        <h4>{course.title}</h4>
                                                        <p>{course.category}</p>
                                                    </div>
                                                </div>
                                                <div className="course_progress">
                                                    <div className="progress_bar" style={{ background: `linear-gradient(to right, ${course.color} 0%, ${course.color} ${(course.progress / course.lessons) * 100}%, #D3D3D3 ${(course.progress / course.lessons) * 100}%, #D3D3D3 100%)` }}></div>
                                                    {
                                                        Math.floor((course.progress / course.lessons) * 100) === 100 ? (
                                                            <span className="completed">Completed</span>
                                                        ) : (
                                                            <span>{Math.floor((course.progress / course.lessons) * 100)}% completed</span>
                                                        )
                                                    }
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button onClick={handleNextCourse} title="Next Course">
                            <FaChevronRight />
                        </button>
                    </div>
                </div>
            </div>
        </div >
    );
}