import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { mediaService } from "@/services/media.service";

// storage.assets public ids: "ast_" + a lower-case ULID (services/media.service.js).
const ASSET_ID = /^ast_[0-9a-z]{26}$/;

async function assetIdFrom(req) {
    const body = await req.json().catch(() => {
        throw new ApiError("Invalid JSON body", 400);
    });
    const assetId = String(body?.assetId || "");
    if (!ASSET_ID.test(assetId)) throw new ApiError("A valid assetId is required", 400);
    return assetId;
}

/** GET: the signed-in user's kept profile photos, newest first. */
export const GET = apiRoute(
    ({ userId }) => mediaService.listAvatars({ userId }),
    { context: "api/user/avatars" }
);

/** PATCH `{ assetId }`: makes a kept photo the profile photo again. */
export const PATCH = apiRoute(
    async ({ req, userId }) => mediaService.restoreAvatar({ userId, assetId: await assetIdFrom(req) }),
    { context: "api/user/avatars", csrf: true, limiter: rateLimiters.upload }
);

/** DELETE `{ assetId }`: deletes a kept photo that is not the current one. */
export const DELETE = apiRoute(
    async ({ req, userId }) => mediaService.deleteAvatar({ userId, assetId: await assetIdFrom(req) }),
    { context: "api/user/avatars", csrf: true, limiter: rateLimiters.upload }
);
