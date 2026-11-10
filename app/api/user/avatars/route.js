import { apiRoute } from "@/lib/routeHandler";
import { mediaService } from "@/services/media.service";

/** GET: the signed-in user's kept profile photos, newest first. */
export const GET = apiRoute(
    ({ userId }) => mediaService.listAvatars({ userId }),
    { context: "api/user/avatars" }
);
