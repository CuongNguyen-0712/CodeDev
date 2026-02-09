import { getSession } from "@/app/lib/session";

export default async function PostCommentCourseService(data) {
    const id = (await getSession())?.userId;
    const req = { userId: id, ...data };

    try {
        const res = await fetch('/api/post/postCommentCourse', {
            method: 'POST',
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
                message: raw.message || "Something is wrong !"
            };
        }
    }
    catch (err) {
        return {
            status: 500,
            message: "External server error !"
        };
    }
} 