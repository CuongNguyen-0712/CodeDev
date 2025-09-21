import { getSession } from "@/app/lib/session";

export default async function UpdateHideStatusProjectService(data) {
    const id = (await getSession())?.userId;
    const req = { ...data, userId: id }

    try {
        const res = await fetch('/api/update/updateHideStatusProject', {
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
                message: raw.message || "Successfully"
            };
        } else {
            return {
                status: res.status,
                message: raw.message || "Failed"
            };
        }
    } catch (error) {
        return {
            status: 500,
            message: "Internal server error"
        };
    }
}