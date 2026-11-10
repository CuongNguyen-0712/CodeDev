'use server';

import { mediaService } from "@/services/media.service";
import { notificationService } from "@/services/notification.service";
import { profileService } from "@/services/profile.service";
import { userService } from "@/services/user.service";
import { userDb } from "@/db/user.db";
import { emailVerificationService } from "@/services/emailVerification.service";
import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import { EMAIL_PATTERN } from "@/lib/definition";

export async function updateUserProfileAction(data) {
    // A locked account (plan 12.3) may still fix a mistyped email, and nothing else.
    const emailOnly = Boolean(data?.email) && !["nickname", "surname", "phone", "name", "bio"].some((key) => data[key]);

    return runAction(async ({ userId }) => {
        // The profile image is set only by uploadAvatarAction (server-chosen Cloudinary asset);
        // an image URL sent here is ignored so a client cannot point it at an arbitrary URL.
        const { nickname, surname, phone, name, bio } = data || {};
        // Stored in lower case (unique index on lower(email)); a new email is unverified again.
        const email = data?.email ? String(data.email).trim().toLowerCase() : data?.email;

        const isUpdate = nickname || surname || phone || name || email || bio;
        if (!isUpdate) {
            throw new ApiError("No data to update", 400);
        }
        if (email && !EMAIL_PATTERN.test(email)) {
            throw new ApiError("Email is invalid", 422);
        }
        // An email belongs to one account: a verified owner keeps it, and an unverified one holds it
        // until it is verified or purged. Either way this account must use another address.
        if (email && await userDb.emailOwnedByOther({ userId, email })) {
            throw new ApiError("This email is already used by another CodeDev account. Use a different email.", 409, { code: "EMAIL_IN_USE" });
        }
        // Each email change mails the new address: share the resend budget (3 / 15 min per user)
        // so the form cannot be used to mail arbitrary addresses.
        if (email) {
            const limit = await rateLimiters.emailVerify.check(userId);
            if (!limit.success) {
                throw new ApiError(`Too many email changes. Try again in ${Math.ceil(limit.retryAfter / 60)} minutes.`, 429, { expose: true });
            }
        }

        const updated = await userService.updateProfile({
            userId,
            nickname,
            surname,
            phone,
            name,
            email,
            bio,
        });

        // A changed email is unverified now: mail the new address. Nothing is sent when the email
        // did not change and was already verified (the token is only issued for unverified users).
        if (email) await emailVerificationService.request(userId);

        return updated;
    }, { allowLocked: emailOnly, limiter: rateLimiters.profile, context: "updateUserProfileAction" });
}

// Any of { showProfile, showLearning, showOnLeaderboard } (booleans); the service checks the keys.
export async function updatePrivacyAction(data) {
    return runAction(
        async ({ userId }) => profileService.updatePrivacy(userId, data ?? {}),
        { limiter: rateLimiters.profile, context: "updatePrivacyAction" }
    );
}

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_IDS = 100;

// { all: true } or { ids: string[] } (1-100 uuids) marks read; { ids, dismiss: true } removes them instead.
export async function markNotificationsAction(body) {
    return runAction(async ({ userId }) => {
        if (body?.all === true) return notificationService.markAllRead({ userId });

        const ids = Array.isArray(body?.ids) ? body.ids : null;
        if (!ids?.length || ids.length > MAX_IDS || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
            throw new ApiError("Body must be { all: true } or { ids: [uuid, ...] }", 400);
        }
        if (body.dismiss === true) return notificationService.dismiss({ userId, ids });
        return notificationService.markRead({ userId, ids });
    }, { limiter: rateLimiters.profile, context: "markNotificationsAction" });
}

// storage.assets public ids: "ast_" + a lower-case ULID (services/media.service.js).
const ASSET_ID = /^ast_[0-9a-z]{26}$/;
const assetIdOf = (value) => {
    const assetId = String(value ?? "");
    if (!ASSET_ID.test(assetId)) throw new ApiError("A valid assetId is required", 400);
    return assetId;
};

// Makes a kept photo the profile photo again.
export async function restoreAvatarAction(assetId) {
    return runAction(
        async ({ userId }) => mediaService.restoreAvatar({ userId, assetId: assetIdOf(assetId) }),
        { limiter: rateLimiters.upload, context: "restoreAvatarAction" }
    );
}

// Deletes a kept photo that is not the current one.
export async function deleteAvatarAction(assetId) {
    return runAction(
        async ({ userId }) => mediaService.deleteAvatar({ userId, assetId: assetIdOf(assetId) }),
        { limiter: rateLimiters.upload, context: "deleteAvatarAction" }
    );
}
