import { apiRoute, requirePublicId } from "@/lib/routeHandler";
import { userService } from "@/services/user.service";

/** GET /api/user/learning-progress?courseId=: modules, lessons and challenges with the learner's state. */
export const GET = apiRoute(async ({ req, userId }) => {
    const courseId = requirePublicId(new URL(req.url).searchParams.get("courseId"), "course id");
    return userService.getLearningProgress({ userId, courseId });
}, { context: "api/user/learning-progress" });
