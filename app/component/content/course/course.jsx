import { useEffect, useState } from "react";

import CreateCourse from "./createCourse";

import axios from "axios";

export default function Course() {

    const course_status = ["All", "Enrolled", "In Progress", "Completed"];
    return (
        <section className="course-container">
            <CreateCourse handle={(value) => handleSetCourse(value)}/>
        </section>
    )
}
