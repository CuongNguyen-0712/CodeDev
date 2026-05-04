import { getLessonCourse } from "@/app/actions/get/action";

export default async function GetLessonCourseService(data) {
    const result = await getLessonCourse(data);

    if (!result) {
        throw new ApiError("Failed to load lesson course", 500);
    }

    return result;
}