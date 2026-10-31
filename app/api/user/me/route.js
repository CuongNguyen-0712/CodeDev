import { apiRoute } from "@/lib/routeHandler";
import { userService } from "@/services/user.service";

/** GET /api/user/me: the signed-in profile (the verify-lock page reads it too, plan 12.3). */
export const GET = apiRoute(({ userId }) => userService.getMe(userId), { context: "api/user/me", allowLocked: true });
