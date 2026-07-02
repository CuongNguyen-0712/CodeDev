import { getRoadmapNodes } from "@/app/actions/get/action";

import { ApiError } from "@/app/lib/error/apiError";

export default async function GetRoadmapNodesService(data) {
    const { userId, roadmapId } = data;

    const ressult = await getRoadmapNodes({ userId, roadmapId });

    if (!ressult) {
        throw new ApiError("Failed to load roadmap nodes, try again later", 500);
    }

    return ressult;
}
