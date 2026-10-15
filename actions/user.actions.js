'use server';

import { userService } from "@/services/user.service";
import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";

export async function updateUserProfileAction(data) {
    return runAction(async ({ userId }) => {
        const { nickname, surname, phone, name, email, image, bio } = data || {};

        const isUpdate = nickname || surname || phone || name || email || image || bio;
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
            image,
            bio,
        });
    }, { limiter: rateLimiters.profile, context: "updateUserProfileAction" });
}
