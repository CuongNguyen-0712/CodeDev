import { createElement } from "react";
import { render } from "@react-email/components";

import { emailTokenDb } from "@/db/emailToken.db";
import { userDb } from "@/db/user.db";
import { ApiError } from "@/lib/error/apiError";
import { auditAuth } from "@/lib/authAudit";
import { generateRefreshToken, hashRefreshToken } from "@/lib/auth.util";
import { invalidateUserCache } from "@/lib/cacheKeys";
import { sendMail } from "@/lib/mail";
import { processAuthOutbox } from "@/services/authOutbox.service";

import AccountEmailTemplate from "@/components/templates/accountEmailTemplate";

/**
 * GitHub / Google accounts on an existing user (docs/email-verification-plan.md 10.3-10.5):
 * link confirmation by email (case 5b), "connected" / "disconnected" notices, and the Settings
 * list / disconnect. Mail goes through the auth outbox like the verification email.
 */

export const PROVIDER_LABEL = { github: "GitHub", google: "Google" };
const LINK_TTL_SEC = 30 * 60;
const hashToken = (token) => hashRefreshToken(`link-account|${token}`);

/** Queues an outbox event and processes it right away. Never throws. */
async function queue(eventType, payload) {
    try {
        const outboxId = await emailTokenDb.enqueue(eventType, payload);
        await processAuthOutbox({ ids: [outboxId], limit: 1 });
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
    /** Case 5b: mails the owner of `link.targetUserId` a link that confirms the pending link. */
    requestLinkEmail: (link) => queue("email.link_requested", {
        userId: link.targetUserId,
        provider: link.provider,
        providerAccountId: link.providerAccountId,
        providerEmail: link.providerEmail,
    }),

    /** Outbox handler for "email.link_requested". Throws when sending fails (retried). */
    sendLinkEmail: async ({ userId, provider, providerAccountId, providerEmail }) => {
        const token = generateRefreshToken();
        const issued = await emailTokenDb.issue({
            userPublicId: userId,
            purpose: "link_account",
            tokenHash: hashToken(token),
            ttlSec: LINK_TTL_SEC,
            payload: { provider, providerAccountId, providerEmail },
        });
        if (!issued) return; // blocked or deleted meanwhile

        const label = PROVIDER_LABEL[provider] || provider;
        await mail(issued.email, `Confirm linking ${label} to your CodeDev account`, {
            preview: `Someone asked to link a ${label} account to your CodeDev account.`,
            heading: `Link ${label} to your account`,
            lines: [
                `Hi ${issued.name || "there"}, someone signed in with a ${label} account that uses ${issued.email} and asked to link it to your CodeDev account.`,
                `If this was you, confirm below. For your security this signs you out on every device and removes the account's current password: from then on you sign in with ${label}.`,
            ],
            action: { label: `Link ${label}`, url: `${process.env.NEXTAUTH_URL}/auth/link/confirm?token=${token}` },
            note: "This link expires in 30 minutes. If you did not ask for this, ignore this email: nothing changes.",
        });
    },

    /** @returns {Promise<{ status: "linked" | "expired" | "invalid" | "in_use", provider?: string }>} */
    confirmLink: async (token) => {
        if (typeof token !== "string" || !/^[0-9a-f]{80}$/.test(token)) return { status: "invalid" };

        let result;
        try {
            result = await emailTokenDb.confirmLink({ tokenHash: hashToken(token) });
        } catch (error) {
            // CD409: the provider account belongs to someone else; 23505: it just became theirs.
            if (error?.code === "CD409" || error?.code === "23505") return { status: "in_use" };
            throw error;
        }
        if (result.status !== "linked") return { status: result.status };

        if (result.outboxIds.length) await processAuthOutbox({ ids: result.outboxIds, limit: result.outboxIds.length });
        await invalidateUserCache(result.userId);
        auditAuth("account.linked", { userId: result.userId, provider: result.provider, reason: "email" });
        return { status: "linked", provider: result.provider };
    },

    /** "connected" / "disconnected" notice to the account's email. Never throws. */
    notify: ({ userId, provider, action, ip = null }) =>
        queue("email.account_notice", { userId, provider, action, ip, at: new Date().toISOString() }),

    /** Outbox handler for "email.account_notice". */
    sendNotice: async ({ userId, provider, action, ip, at }) => {
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
            ],
            note: connected
                ? "Not you? Sign in, disconnect it under Settings > Sign-in methods, then sign out your other devices."
                : "Not you? Sign in and check Settings > Sign-in methods and Active sessions.",
        });
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
