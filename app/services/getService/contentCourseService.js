import { getSession } from "@/app/lib/session";

export default async function GetContentCourseService(data) {
    const user_id = (await getSession())?.userId;

    const params = new URLSearchParams();
    params.set('user_id', user_id);
    params.set('course_id', data.course_id);

    try {
        const res = await fetch(`/api/get/getContentCourse?${params.toString()}`, {
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