import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// CodeDev refresh sessions with rotation by family. See starter.ts for the full task.

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
    private readonly familyEnds = new Map<string, number>();
    private tokensUsed = 0;
    private families = 0;
    private recordCount = 0;
    private accessCount = 0;

    constructor(newTokens: string[]) {
        this.newTokens = newTokens;
    }

    login(userId: string, deviceId: string, at: number): Issued {
        const familyId = `fam-${++this.families}`;
        this.familyEnds.set(familyId, at + FAMILY_MAX_AGE);
        return this.issue(familyId, userId, deviceId, at).issued;
    }

    refresh(token: string, at: number): Issued {
        const old = this.validate(token, at);
        const familyId = `fam-${++this.families}`;
        this.familyEnds.set(familyId, at + FAMILY_MAX_AGE);
        const { record, issued } = this.issue(familyId, old.userId, old.deviceId, at);
        old.status = "rotated";
        old.replacedBy = record.id;
        return issued;
    }

    logout(token: string, at: number): void {
        this.validate(token, at).status = "revoked";
    }

    snapshot(): RefreshRecord[] {
        return this.records.map((r) => ({ ...r }));
    }

    private validate(token: string, at: number): RefreshRecord {
        const hash = sha256(token);
        const record = this.records.find((r) => r.tokenHash === hash);
        if (!record) throw new AuthError("unknown_token");
        if (record.status === "revoked") throw new AuthError("token_revoked");
        if (record.status === "rotated") throw new AuthError("token_rotated");
        if (at >= record.expiresAt) throw new AuthError("token_expired");
        return record;
    }

    private issue(familyId: string, userId: string, deviceId: string, at: number): { record: RefreshRecord; issued: Issued } {
        const refreshToken = this.newTokens[this.tokensUsed++];
        const familyEnd = this.familyEnds.get(familyId) ?? at;
        const record: RefreshRecord = {
            id: `r-${++this.recordCount}`,
            familyId,
            userId,
            deviceId,
            tokenHash: sha256(refreshToken),
            status: "active",
            createdAt: at,
            expiresAt: Math.min(at + REFRESH_TTL, familyEnd),
        };
        this.records.push(record);
        const issued: Issued = {
            familyId,
            refreshToken,
            refreshExpiresAt: record.expiresAt,
            accessTokenId: `at-${++this.accessCount}`,
            accessExpiresAt: at + ACCESS_TTL,
        };
        return { record, issued };
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
