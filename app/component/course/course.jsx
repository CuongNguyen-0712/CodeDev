import Layout from "../ui/layout";
import CourseContent from "./content";

export default function Course() {
    return (
        <Layout children={<CourseContent />}>
        </Layout>
    )
}