import { getSession } from "@/app/lib/session";

export default async function GetMyCourseService({ search, limit, offset, filter }) {
    const params = new URLSearchParams();

    params.set('id', (await getSession())?.userId);
    if (search) params.set('search', search);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);

    Object.entries(filter).forEach(([key, value]) => {
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return;

        if (Array.isArray(value) && value.length > 0) {
            params.set(key, value.join(","));
            return;
        }

        if (typeof value === "string" && value.trim() !== "") {
            params.set(key, value.trim());
            return;
        }

        if (typeof value === "number" || typeof value === "boolean") {
            params.set(key, String(value));
        }
    });

    try {
        const res = await fetch(`/api/get/getMyCourse?${params.toString()}`, {
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
        }
        else {
            return {
                status: res.status,
                message: raw.message
            }
        }

    } catch (err) {
        return {
            status: 500,
            message: err.message
        }
    }
}