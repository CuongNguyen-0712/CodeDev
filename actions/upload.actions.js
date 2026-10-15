'use server';

import { uploadService } from "@/services/upload.service";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";

export async function uploadImageAction(formData) {
    return runAction(async () => {
        const file = formData.get("file");
        const folder = formData.get("folder") || "uploads";

        return uploadService.uploadImage({ file, folder });
    }, { limiter: rateLimiters.upload, context: "uploadImageAction" });
}
