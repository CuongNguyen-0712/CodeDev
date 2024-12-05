import { useEffect, useState } from "react";

import CreateCourse from "./createCourse";
import LoadingItem from "../../feature/loadingItem";

import axios from "axios";

export default function Course() {

    const course_status = ["All", "Enrolled", "In Progress", "Completed"];

    const [data, setData] = useState([]);
    const [course, setCourse] = useState(null);
    const [key, setKey] = useState(0)

    const fetchDataCourses = async () => {
        const response = await axios.get('/data/dataCourses.json');
        const data = response.data;
        setData(data);
        const defaultData = data[0];
        setCourse(defaultData);
    }

    useEffect(() => {
        fetchDataCourses();
    }, [])

    const handleSetCourse = (value) => {
        const minLengthCourse = 0;
        const maxLengthCourse = data.length - 1;
        const newKey = key + value;

        if (data.length === 0) return;

        if (newKey < minLengthCourse) {
            setCourse(data[maxLengthCourse]);
            setKey(maxLengthCourse);
        } else if (newKey > maxLengthCourse) {
            setCourse(data[minLengthCourse]);
            setKey(minLengthCourse);
        } else {
            const newCourse = data[newKey];
            setCourse(newCourse);
            setKey(newKey)
        }
    }

    return (
        <section id='study'>
            {course ?
                <CreateCourse data={course} key={key} handle={(value) => handleSetCourse(value)} />
                :
                <LoadingItem />
            }
        </section>
    )
}
