export default async function GetMyCourseService(data) {
    try {
        const res = await fetch(`/api/get/getMyCourse?id=${data}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            return {
                status: 404,
                message: 'API not found'
            }
        }

        const raw = await res.json();
        if (res.status === 200) {
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
            message: err
        }
    }
}