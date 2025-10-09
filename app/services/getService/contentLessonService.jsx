import { getSession } from "@/app/lib/session";

export default async function GetContentLessonService(data) {
    const user_id = (await getSession())?.userId

    const params = new URLSearchParams();
    params.set('lesson_id', data.lesson_id);
    params.set('user_id', user_id)

    try {
        const res = await fetch(`/api/get/getContentLesson?${params.toString()}`, {
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
            }
        }
    } catch (error) {
        return {
            status: 500,
            message: error.message
        }
    }
}