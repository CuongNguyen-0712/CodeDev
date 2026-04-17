import { getSession } from "@/app/lib/session";

export default async function UpdateVotingCourseService(data) {
    const { id, voting } = data;
    const userId = (await getSession())?.userId;
    const req = { id, voting, userId }

    try {
        const res = await fetch('/api/update/updateVotingCourse', {
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

        const raw = await res.json();

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