import { getRoadmap } from "@/actions/get/action";

import { ApiError } from "@/lib/error/apiError";

export default async function GetRoadmapService(data) {
    const { roadmapId } = data;
    const result = await getRoadmap({ roadmapId });

    if (!result) {
        throw new ApiError("Failed to load roadmap, try again later", 500);
    }

    return result;
}