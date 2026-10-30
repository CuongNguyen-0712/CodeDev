import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// CodeDev refresh sessions: rotate refresh tokens by family (POST /v1/auth/refresh).
//
// The test runner creates RefreshSessionService(newTokens) and plays a script of operations at fake
// clock times (unix seconds). newTokens are the plaintext refresh tokens to hand out, in order.
//
// login(userId, deviceId, at)
//   Starts a new family: "fam-1", "fam-2", ... in creation order (every login starts one, even for
//   the same user and device) and issues the family's first refresh token.
//
// Issuing (login and refresh):
//   - refresh token = the next unused string of newTokens
//   - record { id: "r-1", "r-2", ..., familyId, userId, deviceId, tokenHash: sha256(token),
//              status: "active", createdAt: at,
//              expiresAt: min(at + REFRESH_TTL, familyLoginAt + FAMILY_MAX_AGE) }
//   - access token id "at-1", "at-2", ... expiring at at + ACCESS_TTL (not capped)
//   - return { familyId, refreshToken, refreshExpiresAt, accessTokenId, accessExpiresAt }
//   Only successful operations consume a token, a record id or an access id.
//
// refresh(token, at)
//   Find the record by sha256(token), then check in this order and throw new AuthError(code):
//     no record -> "unknown_token", status "revoked" -> "token_revoked",
//     status "rotated" -> "token_rotated", at >= expiresAt -> "token_expired".
//   A failed refresh changes nothing. On success issue a new token in the SAME family, then set the
//   old record's status to "rotated" and its replacedBy to the new record's id.
//   Do not revoke anything when a rotated token comes back: that is lesson 8.
//
// logout(token, at)
//   Same checks and errors as refresh; on success that record's status becomes "revoked".
//
// snapshot()
//   Every record in creation order; replacedBy only on rotated records. Never store plaintext tokens.

const ACCESS_TTL = 900;            // access token: 15 minutes
const REFRESH_TTL = 2_592_000;     // each refresh token: 30 days (sliding)
const FAMILY_MAX_AGE = 7_776_000;  // a family: 90 days after login (absolute)

type Status = "active" | "rotated" | "revoked";

interface RefreshRecord {
    id: string;
    familyId: string;
    userId: string;
    deviceId: string;
    tokenHash: string;
    status: Status;
    createdAt: number;
    expiresAt: number;
    replacedBy?: string;
}

interface Issued {
    familyId: string;
    refreshToken: string;
    refreshExpiresAt: number;
    accessTokenId: string;
    accessExpiresAt: number;
}

type AuthErrorCode = "unknown_token" | "token_revoked" | "token_rotated" | "token_expired";

class AuthError extends Error {
    readonly code: AuthErrorCode;
    constructor(code: AuthErrorCode) {
        super(code);
        this.code = code;
    }
}

function sha256(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

class RefreshSessionService {
    private readonly newTokens: string[];
    private readonly records: RefreshRecord[] = [];

    constructor(newTokens: string[]) {
        this.newTokens = newTokens;
    }

    login(userId: string, deviceId: string, at: number): Issued {
        // TODO: start a family and issue its first token
        return { familyId: "", refreshToken: this.newTokens[0], refreshExpiresAt: at + REFRESH_TTL, accessTokenId: "", accessExpiresAt: at + ACCESS_TTL };
    }

    refresh(token: string, at: number): Issued {
        // TODO: validate, rotate the old record, issue a new token in the same family
        throw new AuthError("unknown_token");
    }

    logout(token: string, at: number): void {
        // TODO: validate like refresh, then revoke the record
    }

    snapshot(): RefreshRecord[] {
        return this.records.map((r) => ({ ...r }));
    }
}

// ---------------------------------------------------------------- test runner (do not change)
type Op =
    | { op: "login"; at: number; userId: string; deviceId: string }
    | { op: "refresh"; at: number; token: string }
    | { op: "logout"; at: number; token: string };

const input: { newTokens: string[]; ops: Op[] } = JSON.parse(readFileSync(0, "utf8"));
const service = new RefreshSessionService(input.newTokens);
const results = input.ops.map((o): object => {
    try {
        if (o.op === "login") return service.login(o.userId, o.deviceId, o.at);
        if (o.op === "refresh") return service.refresh(o.token, o.at);
        service.logout(o.token, o.at);
        return { loggedOut: true };
    } catch (e) {
        if (e instanceof AuthError) return { error: e.code };
        throw e;
    }
});
console.log(JSON.stringify({ results, store: service.snapshot() }));
