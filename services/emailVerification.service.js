import { createElement } from "react";
import { render } from "@react-email/components";

import { emailTokenDb } from "@/db/emailToken.db";
import { userDb } from "@/db/user.db";
import { ApiError } from "@/lib/error/apiError";
import { generateRefreshToken, hashRefreshToken } from "@/lib/auth.util";
import { invalidateUserCache } from "@/lib/cacheKeys";
import { sendMail } from "@/lib/mail";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";
import { processAuthOutbox } from "@/services/authOutbox.service";

import VerifyEmailTemplate from "@/components/templates/verifyEmailTemplate";

/**
 * Email verification by link (docs/email-verification-plan.md section 4).
 * Sending goes through the auth outbox ("email.verify_requested" { userId }) so a failed send is
 * retried; each attempt issues a fresh token. Tokens are 320-bit random, stored as an HMAC digest
 * kept apart from refresh tokens by the "email-verify|" prefix.
 */

const TTL_SEC = Number(process.env.EMAIL_VERIFY_TTL_SECONDS) || 24 * 60 * 60;
const hashToken = (token) => hashRefreshToken(`email-verify|${token}`);

export const emailVerificationService = {
    /** Queues a verification email and tries to send it right away. Never throws. */
    request: async (userId) => {
        try {
            const outboxId = await emailTokenDb.enqueue("email.verify_requested", { userId });
            await processAuthOutbox({ ids: [outboxId], limit: 1 });
            return true;
        } catch (error) {
            console.error("[email-verify] could not queue:", error?.message);
            return false;
        }
    },

    /** Outbox handler: issues a token and mails the link. Throws when sending fails (retried). */
    send: async (userId) => {
        const token = generateRefreshToken();
        const issued = await emailTokenDb.issue({ userPublicId: userId, purpose: "verify_email", tokenHash: hashToken(token), ttlSec: TTL_SEC });
        if (!issued) return; // already verified, blocked or deleted

        const url = `${process.env.NEXTAUTH_URL}/auth/verify-email?token=${token}`;
        const message = createElement(VerifyEmailTemplate, { name: issued.name, email: issued.email, url, hours: Math.round(TTL_SEC / 3600) });

        await sendMail({
            to: issued.email,
            subject: "Verify your email for CodeDev",
            html: await render(message),
            text: await render(message, { plainText: true }),
        });
    },

    /** Soft gate for purchases (plan section 5): 403 EMAIL_NOT_VERIFIED. */
    assertVerified: async (userId) => {
        if (await userDb.isEmailVerified({ userId })) return;
        throw new ApiError("Verify your email before buying a course. Use the link we sent you, or resend it from the banner.", 403, {
            code: "EMAIL_NOT_VERIFIED",
            expose: true,
        });
    },

    /** @returns {Promise<{ status: "verified" | "already_verified" | "expired" | "invalid" }>} */
    verify: async (token) => {
        if (typeof token !== "string" || !/^[0-9a-f]{80}$/.test(token)) return { status: "invalid" };

        const { status, userId } = await emailTokenDb.verifyEmail({ tokenHash: hashToken(token) });
        if (status === "verified") {
            await invalidateUserCache(userId);
            // Open tabs refetch /api/user/me and drop the "verify your email" banner.
            publishToUser(userId, events.PROFILE_UPDATED, {});
        }
        return { status };
    },
};

export default emailVerificationService;
