import { getSession } from "@/app/lib/session";

export default async function UpdateInfoService(data) {
    const id = (await getSession())?.userId;
    if (!id) {
        return { status: 401, message: "User not authenticated" };
    }

    try {
        let imageUrl = data.image;

        if (data.image instanceof File) {
            const formData = new FormData();
            formData.append("file", data.image);

            const uploadRes = await fetch('/api/post/uploadCloudinary', {
                method: 'POST',
                body: formData
            });

            const uploadData = await uploadRes.json();

            if (!uploadRes.ok) {
                return { status: uploadRes.status, message: uploadData.error || "Upload failed" };
            }

            imageUrl = uploadData.url;
        }

        const res = await fetch('/api/update/updateInfo', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, image: imageUrl, userId: id })
        });

        const raw = await res.json();

        return {
            status: res.status,
            message: res.ok ? (raw.message || "Update information successfully") : (raw.message || "Unknown server error")
        };
    } catch (err) {
        console.error("Network/API call failed:", err);
        return { status: 500, message: err.message };
    }
}
