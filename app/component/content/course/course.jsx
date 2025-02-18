import CreateCourse from "./createCourse";

export default function Course() {

    return (
        <section className="course-container">
            <CreateCourse handle={(value) => handleSetCourse(value)} />
        </section>
    )
}
