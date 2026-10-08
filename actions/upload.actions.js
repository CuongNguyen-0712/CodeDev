'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { uploadService } from "@/services/upload.service";

export async function uploadImageAction(formData) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return { success: false, message: "Unauthorized: Please sign in to upload files", status: 401 };
        }

        const file = formData.get("file");
        const folder = formData.get("folder") || "uploads";

        const secureUrl = await uploadService.uploadImage({ file, folder });

        return { success: true, data: secureUrl };
    } catch (error) {
        return {
            success: false,
            message: error.message || "Failed to upload image, please try again.",
            status: error.status || 500
        };
    }
}
