'use server';

import { mediaService } from "@/services/media.service";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";

/**
 * Uploads the signed-in user's avatar and makes it their profile image in one step. The client
 * sends only the file: the Cloudinary folder, file name and the stored URL are decided here.
 */
export async function uploadAvatarAction(formData) {
    return runAction(async ({ userId }) => {
        const file = formData?.get?.("file");

        return mediaService.uploadAvatar({ userId, file });
    }, { limiter: rateLimiters.upload, context: "uploadAvatarAction" });
}

/** Uploads an image for a blog post; the folder and file name are decided here, the client sends only the file. */
export async function uploadBlogImageAction(formData) {
    return runAction(async ({ userId }) => {
        const file = formData?.get?.("file");

        return mediaService.uploadBlogImage({ userId, file });
    }, { limiter: rateLimiters.upload, context: "uploadBlogImageAction" });
}
