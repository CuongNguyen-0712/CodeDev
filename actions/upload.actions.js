'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import UploadService from "@/services/postService/uploadService";

export async function uploadImageAction(formData) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return { success: false, message: "Unauthorized: Please sign in to upload files", status: 401 };
        }

        const file = formData.get("file");
        const folder = formData.get("folder") || "uploads";

        if (!file || typeof file === "string" || !file.type?.startsWith("image/")) {
            return { success: false, message: "Invalid file type. Only image files are permitted.", status: 400 };
        }

        if (file.size > 5 * 1024 * 1024) {
            return { success: false, message: "File size exceeds 5MB limit", status: 400 };
        }

        const data = { file, folder };
        const secureUrl = await UploadService(data);

        return { success: true, data: secureUrl };
    } catch (error) {
        return {
            success: false,
            message: error.message || "Failed to upload image, please try again.",
            status: error.status || 500
        };
    }
}
