export default async function GetLessonCourseService(data) {
    const { course_id } = data

    const params = new URLSearchParams();
    params.set('course_id', course_id);

    try {
        const res = await fetch(`/api/get/getLessonCourse?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (res.status === 404) {
            return {
                status: 404,
                message: "API not found"
            }
        }

        const raw = await res.json();

        if (res.ok) {
            return {
                status: res.status,
                data: raw.data
            };
        } else {
            return {
                status: res.status,
                message: raw.message
            };
        }
    } catch (error) {
        return {
            status: 500,
            message: error.message
        };
    }
}