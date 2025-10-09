import { getSession } from "@/app/lib/session";

export default async function UpdateLessonService(data) {
    const user_id = (await getSession())?.userId;
    const req = { ...data, user_id: user_id }
    try {
        const res = await fetch(`/api/update/updateLesson`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req),
        });

        if (res.status === 404) {
            return {
                status: 404,
                message: 'API not found'
            }
        }

        const raw = await res.json();

        return {
            status: res.status,
            message: raw.message
        }

    } catch (err) {
        return {
            status: 500,
            message: err.message
        }
    }
}