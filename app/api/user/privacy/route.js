import { apiRoute } from "@/lib/routeHandler";
import { profileService } from "@/services/profile.service";

// Public profile and leaderboard visibility of the signed-in user.
export const GET = apiRoute(
    ({ userId }) => profileService.getPrivacy(userId),
    { context: "api/user/privacy" }
);
