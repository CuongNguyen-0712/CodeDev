export default async function DeleteMyCourseServive(data) {
    try {
        const res = await fetch(`/api/delete/deleteMyCourse`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            return {
                status: 404,
                message: 'API not found'
            }
        }

        const raw = await res.json();

        return {
            status: res.status,
            message: raw.message
        }
    }
    catch {
        console.error(err);
        return {
            status: 500,
            message: err
        }
    }
}