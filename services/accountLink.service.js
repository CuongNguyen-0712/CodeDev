import { createElement } from "react";
import { render } from "@react-email/components";
import bcrypt from "bcryptjs";

import { accountPurgeDb } from "@/db/accountPurge.db";
import { emailTokenDb } from "@/db/emailToken.db";
import { userDb } from "@/db/user.db";
import { ApiError } from "@/lib/error/apiError";
import { auditAuth } from "@/lib/authAudit";
import { generateRefreshToken, hashRefreshToken } from "@/lib/auth.util";
import { invalidateUserCache } from "@/lib/cacheKeys";
import { sendMail } from "@/lib/mail";
import { failureGuards, rateLimiters } from "@/lib/rateLimit";
import { dispatchAuthOutbox } from "@/services/authOutbox.service";

import AccountEmailTemplate from "@/components/templates/accountEmailTemplate";

/**
 * GitHub / Google accounts on an existing user (docs/email-verification-plan.md 10.4-10.5, 11):
 * pending OAuth claim confirmed by email (11.1 claim with a new password, 11.3 B confirm),
 * "connected" / "disconnected" notices, and the Settings list / disconnect. Mail goes through
 * the auth outbox like the verification email.
 */

export const PROVIDER_LABEL = { github: "GitHub", google: "Google" };
const LINK_TTL_SEC = 30 * 60;
const hashToken = (token) => hashRefreshToken(`link-account|${token}`);

/** Queues an outbox event and processes it right away. Never throws. */
async function queue(eventType, payload) {
    try {
        const outboxId = await emailTokenDb.enqueue(eventType, payload);
        await dispatchAuthOutbox([outboxId]);
        return true;
    } catch (error) {
        console.error(`[account-link] could not queue ${eventType}:`, error?.message);
        return false;
    }
}

async function mail(to, subject, props) {
    const message = createElement(AccountEmailTemplate, props);
    await sendMail({ to, subject, html: await render(message), text: await render(message, { plainText: true }) });
}

export const accountLinkService = {
    /**
     * Pending OAuth claim (plan 11.1, 11.3 B): mails the owner of `link.targetUserId` a link that
     * confirms it. `link.mode`: 'claim' (unverified account) | 'confirm' (verified account).
     * Limited to 3 mails / 15 min per account (own bucket). Never throws.
     * @returns {Promise<{ sent: boolean, retryAfter?: number }>}
     */
    requestLinkEmail: async (link) => {
        const limit = await rateLimiters.emailVerify.check(`link:${link.targetUserId}`);
        if (!limit.success) return { sent: false, retryAfter: limit.retryAfter };

        const sent = await queue("email.link_requested", {
            userId: link.targetUserId,
            provider: link.provider,
            providerAccountId: link.providerAccountId,
            providerEmail: link.providerEmail,
            mode: link.mode === "confirm" ? "confirm" : "claim",
        });
        return { sent };
    },

    /** Outbox handler for "email.link_requested". Throws when sending fails (retried). */
    sendLinkEmail: async ({ userId, provider, providerAccountId, providerEmail, mode = "claim" }) => {
        const token = generateRefreshToken();
        const issued = await emailTokenDb.issue({
            userPublicId: userId,
            purpose: "link_account",
            tokenHash: hashToken(token),
            ttlSec: LINK_TTL_SEC,
            payload: { provider, providerAccountId, providerEmail, mode },
        });
        if (!issued) return; // blocked, deleted, email changed or verified meanwhile

        const label = PROVIDER_LABEL[provider] || provider;
        const url = `${process.env.NEXTAUTH_URL}/auth/link/confirm?token=${token}&mode=${mode}&provider=${provider}`;
        const claim = mode === "claim";
        await mail(issued.email, `Confirm linking ${label} to your CodeDev account`, {
            preview: `Someone signed in with ${label} using ${issued.email}.`,
            heading: `Link ${label} to your account`,
            lines: [
                `Hi ${issued.name || "there"}, someone signed in with a ${label} account that uses ${issued.email} and asked to link it to your CodeDev account.`,
                claim
                    ? "If this was you, confirm below and choose a new password. For your security this signs you out on every device and replaces every previous way to sign in."
                    : `If this was you, confirm below. You can then sign in with ${label} or your current sign-in method.`,
            ],
            action: { label: claim ? `Link ${label} and set a password` : `Link ${label}`, url },
            note: "This link expires in 30 minutes. If you did not ask for this, ignore this email: nothing changes.",
        });
    },

    /**
     * Explicit confirmation of a pending claim. `password` (the new one) is required for a claim.
     * @returns {Promise<{ status: "linked" | "password_required" | "weak_password" | "expired" | "invalid" | "in_use",
     *                     mode?: string, provider?: string, username?: string }>}
     */
    confirmLink: async (token, password = null) => {
        if (typeof token !== "string" || !/^[0-9a-f]{80}$/.test(token)) return { status: "invalid" };
        // Same rule as sign-up; 72 is bcrypt's limit (longer input is silently cut).
        if (password != null && (typeof password !== "string" || password.length < 8 || password.length > 72)) {
            return { status: "weak_password" };
        }

        let result;
        try {
            const passwordHash = password ? await bcrypt.hash(password, 10) : null;
            result = await emailTokenDb.confirmLink({ tokenHash: hashToken(token), passwordHash });
        } catch (error) {
            // CD409: the provider account belongs to someone else; 23505: it just became theirs.
            if (error?.code === "CD409" || error?.code === "23505") return { status: "in_use" };
            throw error;
        }
        if (result.status !== "linked") return { status: result.status, mode: result.mode };

        if (result.outboxIds.length) await dispatchAuthOutbox(result.outboxIds);
        await invalidateUserCache(result.userId);
        const claim = result.mode === "claim";
        if (claim) await failureGuards.login.reset(result.username).catch(() => { });
        auditAuth("account.linked", { userId: result.userId, provider: result.provider, reason: claim ? "claim" : "email" });
        await accountLinkService.notify({ userId: result.userId, provider: result.provider, action: "connected", passwordChanged: claim });
        return { status: "linked", mode: result.mode, provider: result.provider, username: result.username };
    },

    /** "connected" / "disconnected" notice to the account's email. Never throws. */
    notify: ({ userId, provider, action, ip = null, passwordChanged = false }) =>
        queue("email.account_notice", { userId, provider, action, ip, passwordChanged, at: new Date().toISOString() }),

    /** Outbox handler for "email.account_notice". */
    sendNotice: async ({ userId, provider, action, ip, passwordChanged = false, at }) => {
        const to = await userDb.getMailRecipient({ userId });
        if (!to) return;

        const label = PROVIDER_LABEL[provider] || provider;
        const connected = action === "connected";
        const when = new Date(at).toUTCString();
        await mail(to.email, `${label} was ${connected ? "connected to" : "disconnected from"} your CodeDev account`, {
            preview: `${label} ${connected ? "can now sign in to" : "no longer signs in to"} your CodeDev account.`,
            heading: `${label} ${connected ? "connected" : "disconnected"}`,
            lines: [
                `Hi ${to.name || "there"}, a ${label} account was ${connected ? "connected to" : "disconnected from"} your CodeDev account on ${when}${ip ? ` from IP ${ip}` : ""}.`,
                connected ? `You can now sign in with ${label}.` : `You can no longer sign in with that ${label} account.`,
                ...(passwordChanged ? ["Your password was changed and every device was signed out. Any other sign-in method on the account was removed."] : []),
            ],
            note: connected
                ? "Not you? Sign in, disconnect it under Settings > Sign-in methods, then sign out your other devices."
                : "Not you? Sign in and check Settings > Sign-in methods and Active sessions.",
        });
    },

    /** `{ owner_username, email_verified, deletable, purge_after }` of a refused Connect (plan 12.4), or null. */
    linkConflict: ({ userId, provider, providerAccountId }) => userDb.getLinkConflict({ userId, provider, providerAccountId }),

    /** "Delete and switch" (plan 12.4): deletes the signed-in, never-verified account right now. */
    deleteUnverified: async ({ userId, sessionId = null, ip = null }) => {
        const result = await accountPurgeDb.purgeUser({ userPublicId: userId, requested: true });
        if (result.status === "gone") {
            throw new ApiError("This account is verified, or was never deletable here.", 409, { code: "NOT_DELETABLE", expose: true });
        }
        if (result.status === "skipped") {
            throw new ApiError("This account has purchase history and cannot be deleted here.", 409, { code: "NOT_DELETABLE", expose: true });
        }

        auditAuth("account.purged", { userId, sessionId, ip, reason: "user_requested", count: result.files });
        // As the maintenance job does: sessions to Redis, files to storage.
        await dispatchAuthOutbox(result.outboxIds);
    },

    /** Settings > Sign-in methods. */
    listMethods: async (userId) => {
        const rows = await userDb.listSignInMethods({ userId });
        return {
            password: rows.some((r) => r.provider === "credentials" && r.has_password),
            providers: rows
                .filter((r) => r.provider !== "credentials")
                .map((r) => ({ provider: r.provider, email: r.provider_email, connectedAt: r.created_at })),
        };
    },

    unlink: async ({ userId, provider, ip = null }) => {
        if (!PROVIDER_LABEL[provider]) throw new ApiError("Unknown sign-in method.", 400, { expose: true });

        const result = await userDb.unlinkProvider({ userId, provider });
        if (result === "not_linked") throw new ApiError(`${PROVIDER_LABEL[provider]} is not connected.`, 404, { expose: true });
        if (result === "last_method") {
            throw new ApiError("Add another sign-in method before disconnecting this one.", 409, { code: "LAST_SIGN_IN_METHOD", expose: true });
        }

        auditAuth("account.unlinked", { userId, provider, ip });
        await invalidateUserCache(userId);
        await accountLinkService.notify({ userId, provider, action: "disconnected", ip });
    },
};

export default accountLinkService;
