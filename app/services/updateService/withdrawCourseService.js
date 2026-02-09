import { getSession } from "@/app/lib/session";

export default async function UpdateWithdrawCourseService(data) {
    const id = (await getSession())?.userId;
    const req = { course_id: data, user_id: id }

    try {
        const res = await fetch('/api/update/updateWithdrawCourse', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req)
        });

        if (res.status === 404) {
            return {
                status: 404,
                message: "API not found"
            };
        }

        const raw = res.json();

        if (res.ok) {
            return {
                status: res.status,
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
            message: "Internal server error"
        };
    }
}