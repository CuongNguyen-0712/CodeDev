import { getSession } from "@/app/lib/session";

export default async function GetCourseService({ search, limit, offset }) {
    const params = new URLSearchParams();
    params.set('id', (await getSession())?.userId);
    if (search) params.set('search', search);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);

    try {
        const res = await fetch(`/api/get/getCourse?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            return {
                status: 404,
                message: "API not found"
            }
        }

        const raw = await res.json();

        if (res.status === 200) {
            return {
                status: res.status,
                data: raw.data
            }
        }
        else {
            return {
                status: res.status,
                message: raw.message
            }
        }
    }
    catch (err) {
        console.error(err);
        return {
            status: 500,
            message: err.message
        }
    }
}