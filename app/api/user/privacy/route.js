import { apiRoute } from "@/lib/routeHandler";
import { rateLimiters } from "@/lib/rateLimit";
import { ApiError } from "@/lib/error/apiError";
import { profileService } from "@/services/profile.service";

// Public profile and leaderboard visibility of the signed-in user.
export const GET = apiRoute(
    ({ userId }) => profileService.getPrivacy(userId),
    { context: "api/user/privacy" }
);

// Body: any of { showProfile, showLearning, showOnLeaderboard } (booleans).
export const PATCH = apiRoute(
    async ({ req, userId }) => {
        const body = await req.json().catch(() => {
            throw new ApiError("Invalid JSON body", 400);
        });
        return profileService.updatePrivacy(userId, body);
    },
    { context: "api/user/privacy", csrf: true, limiter: rateLimiters.profile }
);
