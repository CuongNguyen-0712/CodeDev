import { getMyProject } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetMyProjectService(data) {
    const { userId, search, limit, offset, methods, statuses } = data;

    const result = await getMyProject({ userId, search, limit, offset, methods, statuses });

    if (!result) {
        throw new ApiError("Failed to load projects", 500);
    }

    return result;
}