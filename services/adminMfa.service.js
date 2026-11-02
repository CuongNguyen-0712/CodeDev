import crypto from "node:crypto";
import QRCode from "qrcode";

import { adminDb } from "@/db/admin.db";
import { adminMfaDb } from "@/db/adminMfa.db";
import { isDeployedEnv } from "@/lib/appEnv.mjs";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { FailureGuard } from "@/lib/rateLimit";
import { generateTotpSecret, matchTotp, totpUri } from "@/lib/totp";

/**
 * Two-factor authentication for the admin area (docs/admin-panel-plan.md 2.1, 3.4).
 *   - Roles of rank 80 and above (admin, super_admin), and anyone holding a permission in
 *     MFA_PERMISSIONS (course managers), must enrol before using the admin area, and each session
 *     passes the second factor once (identity.sessions.mfa_verified_at).
 *   - Enrolment needs a sign-in from the last 10 minutes, so an old stolen session cannot attach
 *     its own authenticator before the owner does.
 *   - Sensitive actions also need a confirmation in the last 15 minutes (sessions.reauth_at).
 *   - The TOTP secret is encrypted with a key derived from ADMIN_MFA_KEY (required in production and
 *     staging; local development falls back to NEXTAUTH_SECRET);
 *     recovery codes are stored as keyed hashes and work once.
 * ADMIN_MFA_REQUIRED=0 turns the requirement off outside production and staging only (envCheck).
 */

export const MFA_REQUIRED_RANK = 80;
export const REAUTH_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_CODES = 8;

export const mfaRequired = (env = process.env) => !["0", "false", "off"].includes(String(env.ADMIN_MFA_REQUIRED ?? "").trim().toLowerCase());
// Below admin rank, a second factor is still needed by anyone who can change prices or publishing, or read PII or learners' code.
const MFA_PERMISSIONS = ["course.price", "course.publish", "submission.read", "user.pii"];
export const FRESH_SIGN_IN_MS = 10 * 60 * 1000;

export const mfaRequiredFor = (actor) => mfaRequired()
    && (Number(actor?.rank) >= MFA_REQUIRED_RANK || MFA_PERMISSIONS.some((permission) => actor?.permissions?.has(permission)));

function keyFor(purpose) {
    // Deployed environments need a key of their own, so rotating NEXTAUTH_SECRET never locks the admins out.
    const secret = process.env.ADMIN_MFA_KEY || (isDeployedEnv() ? null : process.env.NEXTAUTH_SECRET);
    if (!secret) throw new ApiError("Two-factor authentication is not configured", 503);
    return Buffer.from(crypto.hkdfSync("sha256", secret, "codedev-admin-mfa", purpose, 32));
}

export function encryptSecret(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyFor("totp-secret"), iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

export function decryptSecret(stored) {
    const [iv, tag, data] = String(stored).split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFor("totp-secret"), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const hashRecovery = (code) => crypto.createHmac("sha256", keyFor("recovery-code")).update(String(code).replace(/[\s-]/g, "").toLowerCase()).digest("hex");

const newRecoveryCode = () => {
    const raw = crypto.randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
};

const invalidCode = () => new ApiError("That code is not valid. Check the time on your phone and try again.", 400, { code: "MFA_INVALID" });

async function audit(client, actor, action, reason = null) {
    await adminDb.audit(client, { actorId: actor.id, action, targetType: "user", targetId: actor.publicId, reason });
}

// 5 wrong codes within an hour lock the second factor for an hour (about 120 guesses a day at most).
export const mfaFailureGuard = new FailureGuard({ prefix: "admin-mfa", maxFailures: 5, windowSeconds: 60 * 60, lockSeconds: 60 * 60 });

/** Refuses while locked; a wrong code counts and is audited (outside the rolled-back transaction), a right one clears the count. */
async function guarded(actor, work) {
    const lock = await mfaFailureGuard.status(actor.publicId);
    if (lock.locked) {
        throw new ApiError(`Too many wrong codes. Try again in ${Math.ceil(lock.retryAfter / 60)} minutes.`, 429, { code: "MFA_LOCKED" });
    }
    try {
        const result = await work();
        await mfaFailureGuard.reset(actor.publicId);
        return result;
    } catch (error) {
        if (error?.errorCode === "MFA_INVALID") {
            await mfaFailureGuard.fail(actor.publicId);
            await withTransaction((client) => audit(client, actor, "mfa.failed"));
        }
        throw error;
    }
}

export const adminMfaService = {
    status: async ({ actor, sessionId }) => {
        const [row, session] = await Promise.all([
            adminMfaDb.get({ userDbId: actor.id }),
            sessionId ? adminMfaDb.sessionState({ sessionId, userDbId: actor.id }) : null,
        ]);
        const reauthAt = session?.reauth_at ? new Date(session.reauth_at).getTime() : 0;
        return {
            required: mfaRequiredFor(actor),
            enrolled: Boolean(row?.confirmed_at),
            verified: Boolean(session?.mfa_verified_at),
            recent: reauthAt > Date.now() - REAUTH_WINDOW_MS,
            recoveryLeft: row?.recovery_left ?? 0,
        };
    },

    /** A new pending secret for the enrolment screen (409 once enrolled). */
    setup: async ({ actor, sessionId, account }) => {
        const state = sessionId ? await adminMfaDb.sessionState({ sessionId, userDbId: actor.id }) : null;
        if (!state || Date.now() - new Date(state.created_at).getTime() > FRESH_SIGN_IN_MS) {
            throw new ApiError(
                "For your security, sign out and sign in again, then set up two-factor authentication within 10 minutes.",
                403,
                { code: "FRESH_SIGN_IN_REQUIRED" }
            );
        }
        const secret = generateTotpSecret();
        const saved = await adminMfaDb.savePending({ userDbId: actor.id, secretEnc: encryptSecret(secret) });
        if (!saved) throw new ApiError("Two-factor authentication is already set up", 409, { code: "MFA_ENROLLED" });
        const uri = totpUri({ secret, account });
        // Drawn here so the secret never goes to a QR service or a client library.
        const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
        return { secret, uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
    },

    /** First code from the app: enrols, returns the recovery codes once, and verifies this session. */
    confirm: async ({ actor, sessionId, code }) => guarded(actor, () => withTransaction(async (client) => {
        const row = await adminMfaDb.lock(client, { userDbId: actor.id });
        if (!row) throw new ApiError("Start the setup first", 409);
        if (row.confirmed_at) throw new ApiError("Two-factor authentication is already set up", 409, { code: "MFA_ENROLLED" });
        const step = matchTotp(decryptSecret(row.secret_enc), code);
        if (step == null) throw invalidCode();

        const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
        await adminMfaDb.confirm(client, { userDbId: actor.id, step });
        await adminMfaDb.replaceRecoveryCodes(client, { userDbId: actor.id, hashes: codes.map(hashRecovery) });
        if (sessionId) await adminMfaDb.markSession(client, { sessionId, userDbId: actor.id });
        await audit(client, actor, "mfa.enroll");
        return { recoveryCodes: codes };
    })),

    /** A code from the app (never the same one twice) or a recovery code; verifies and confirms this session. */
    verify: async ({ actor, sessionId, code }) => guarded(actor, () => withTransaction(async (client) => {
        const row = await adminMfaDb.lock(client, { userDbId: actor.id });
        if (!row?.confirmed_at) throw new ApiError("Two-factor authentication is not set up", 409, { code: "MFA_NOT_ENROLLED" });

        const given = String(code || "").trim();
        let usedRecovery = false;
        if (/^\d{6}$/.test(given.replace(/\s+/g, ""))) {
            const step = matchTotp(decryptSecret(row.secret_enc), given);
            if (step == null || step <= Number(row.last_step)) throw invalidCode();
            await adminMfaDb.useStep(client, { userDbId: actor.id, step });
        } else {
            usedRecovery = await adminMfaDb.useRecoveryCode(client, { userDbId: actor.id, hash: hashRecovery(given) });
            if (!usedRecovery) throw invalidCode();
        }

        if (!sessionId || !(await adminMfaDb.markSession(client, { sessionId, userDbId: actor.id }))) {
            throw new ApiError("Sign in again", 401);
        }
        if (usedRecovery) await audit(client, actor, "mfa.recovery_code_used");
        return { verified: true };
    })),

    /** Lost device (npm run admin:role -- reset-mfa): removes the factor; the user enrols again. */
    reset: async ({ userDbId, client }) => adminMfaDb.reset(client, { userDbId }),
};
