import { getSession } from "@/app/lib/session";

export default async function PostCreateTeamService(data) {
    const id = (await getSession())?.userId;
    const req = { userId: id, ...data };

    try {
        const res = await fetch('/api/post/postCreateTeam', {
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
                message: raw.message || "Create team successfully"
            };
        } else {
            return {
                status: res.status,
                message: raw.message || "Unknown server error"
            };
        }
    }
    catch (err) {
        return {
            status: 500,
            message: err.message || "Something is wrong !"
        };
    }
} 