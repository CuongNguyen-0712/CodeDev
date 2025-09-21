import { getSession } from "@/app/lib/session";

export default async function GetCourseService({ search, limit, offset, filter }) {
    const params = new URLSearchParams();
    params.set('id', (await getSession())?.userId);
    if (search) params.set('search', search);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);

    Object.entries(filter)
        .filter(([_, value]) => value != null)
        .forEach(([key, value]) => {
            params.set(key, value);
        });

    try {
        const res = await fetch(`/api/get/getCourse?${params.toString()}`, {
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
        return {
            status: 500,
            message: err.message
        }
    }
}