import { useState, useEffect } from "react"

import Image from "next/image";

import axios from "axios";

export default function CreateCourse() {

    const [course, setCourse] = useState({
        defaultCourse: [],
        currentCourse: []
    })

    const fetchData = async () => {
        const res = await axios.get('/data/dataCourses.json');
        const data = res.data;
        setCourse({ defaultCourse: data, currentCourse: data });
    }

    useEffect(() => {
        fetchData();
    }, [])

    return (
        <div className="course-frame">
            {course.defaultCourse.map((item, index) => (
                <div key={index} className="course">
                    <Image src={item.icon} width={50} height={50} alt="image-course"/>
                </div>
            ))}
        </div>
    )
}