import { getMyFriends } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetMyFriendService(data) {
    const { userId, search } = data;

    const result = await getMyFriends({ userId, search });

    if (!result) {
        throw new ApiError("Failed to get friends, try again later", 500);
    }

    return result;
}