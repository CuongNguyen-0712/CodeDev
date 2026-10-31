import { apiRoute } from "@/lib/routeHandler";
import { userService } from "@/services/user.service";

/** GET /api/user/overview: dashboard summary of the signed-in learner. */
export const GET = apiRoute(({ userId }) => userService.getOverview(userId), { context: "api/user/overview" });
