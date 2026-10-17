'use server';

import { userService } from "@/services/user.service";
import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";

export async function updateUserProfileAction(data) {
    return runAction(async ({ userId }) => {
        // The profile image is set only by uploadAvatarAction (server-chosen Cloudinary asset);
        // an image URL sent here is ignored so a client cannot point it at an arbitrary URL.
        const { nickname, surname, phone, name, email, bio } = data || {};

        const isUpdate = nickname || surname || phone || name || email || bio;
        if (!isUpdate) {
            throw new ApiError("No data to update", 400);
        }

        return userService.updateProfile({
            userId,
            nickname,
            surname,
            phone,
            name,
            email,
            bio,
        });
    }, { limiter: rateLimiters.profile, context: "updateUserProfileAction" });
}
