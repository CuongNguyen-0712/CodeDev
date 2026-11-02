import crypto from "node:crypto";
import QRCode from "qrcode";

import { adminDb } from "@/db/admin.db";
import { adminMfaDb } from "@/db/adminMfa.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { generateTotpSecret, matchTotp, totpUri } from "@/lib/totp";

/**
 * Two-factor authentication for the admin area (docs/admin-panel-plan.md 2.1, 3.4).
 *   - Roles of rank 80 and above (admin, super_admin) must enrol before using the admin area,
 *     and each session passes the second factor once (identity.sessions.mfa_verified_at).
 *   - Sensitive actions also need a confirmation in the last 15 minutes (sessions.reauth_at).
 *   - The TOTP secret is encrypted with a key derived from NEXTAUTH_SECRET (or ADMIN_MFA_KEY);
 *     recovery codes are stored as keyed hashes and work once.
 * ADMIN_MFA_REQUIRED=0 turns the requirement off outside production and staging only (envCheck).
 */

export const MFA_REQUIRED_RANK = 80;
export const REAUTH_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_CODES = 8;

export const mfaRequired = (env = process.env) => !["0", "false", "off"].includes(String(env.ADMIN_MFA_REQUIRED ?? "").trim().toLowerCase());
export const mfaRequiredFor = (actor) => mfaRequired() && Number(actor?.rank) >= MFA_REQUIRED_RANK;

function keyFor(purpose) {
    const secret = process.env.ADMIN_MFA_KEY || process.env.NEXTAUTH_SECRET;
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
    setup: async ({ actor, account }) => {
        const secret = generateTotpSecret();
        const saved = await adminMfaDb.savePending({ userDbId: actor.id, secretEnc: encryptSecret(secret) });
        if (!saved) throw new ApiError("Two-factor authentication is already set up", 409, { code: "MFA_ENROLLED" });
        const uri = totpUri({ secret, account });
        // Drawn here so the secret never goes to a QR service or a client library.
        const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
        return { secret, uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
    },

    /** First code from the app: enrols, returns the recovery codes once, and verifies this session. */
    confirm: async ({ actor, sessionId, code }) => withTransaction(async (client) => {
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
    }),

    /** A code from the app (never the same one twice) or a recovery code; verifies and confirms this session. */
    verify: async ({ actor, sessionId, code }) => withTransaction(async (client) => {
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
    }),

    /** Lost device (npm run admin:role -- reset-mfa): removes the factor; the user enrols again. */
    reset: async ({ userDbId, client }) => adminMfaDb.reset(client, { userDbId }),
};
