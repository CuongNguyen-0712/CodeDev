import { getUsersSocial } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetUserSocialService(data) {
    const { userId, search, limit, offset } = data;

    const result = await getUsersSocial({ userId, search, limit, offset });

    if (!result) {
        throw new ApiError("Failed to load user social data, try again later", 500);
    }

    return result;
}