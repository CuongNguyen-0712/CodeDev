import { getSession } from "@/app/lib/session";

export default async function PostRegisterCourseService(courseId) {
    const userId = (await getSession())?.userId;
    const data = { userId: userId, courseId: courseId };
    try {
        const res = await fetch('/api/post/postRegisterCourse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
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
                data: raw.data,
                message: raw.message || "Register course successfully"
            };
        } else {
            return {
                status: res.status,
                message: raw.message || "Unknown server error"
            };
        }
    } catch (err) {
        console.error("Network/API call failed:", err);
        return {
            status: 500,
            message: err.message
        };
    }
}
