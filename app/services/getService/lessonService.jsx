import { client } from "@/app/lib/sanity";

export default async function getLessonService(id) {
    try {
        const query = `*[_type == "lesson" && _id == $id][0]{
            title,
            slug,
            description,
            content
        }`;

        const lesson = await client.fetch(query, { id });

        if (!lesson) {
            return {
                status: 404,
                message: "Lesson not found"
            }
        }
        else {
            return {
                status: 200,
                data: lesson
            }
        }
    } catch (error) {
        return {
            status: 500,
            message: "Failed to fetch lesson"
        }
    }
}