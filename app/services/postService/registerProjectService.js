import { postRegisterProject } from "@/app/actions/post/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function PostRegisterProjectService(data) {
    const { userId, projectId } = data;

    const result = await postRegisterProject({ userId, projectId });

    if (!result) {
        throw new ApiError("Failed to register project", 500);
    }

    return result;
}