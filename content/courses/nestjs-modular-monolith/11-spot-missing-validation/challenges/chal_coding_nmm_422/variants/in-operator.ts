import { readFileSync } from "node:fs";

// Spot the AI Mistake: a DTO that lets unknown fields through. The request sent to an AI coding
// assistant was:
//   "Write the request validation for PATCH /users/me/profile. UpdateProfileDto has three optional
//    fields: displayName (string, 1-50 characters), bio (string, at most 280 characters) and
//    avatarUrl (https URL, at most 2048 characters). Return 400 with the list of messages when the
//    body is invalid, otherwise pass the DTO to UsersRepository.updateProfile()."
// The assistant wrote validateUpdateProfile() below. Its tests passed and the PR was merged.
//
// A week later the leaderboard shows a learner with 9,999,999 EXP, and the audit log shows that
// the same learner became an admin through PATCH /users/me/profile.
//
// Fix validateUpdateProfile() so that only displayName, bio and avatarUrl can ever reach the
// repository. A body with any other property is rejected with 400 and one message per unknown
// property, "property <name> should not exist", in the order the properties appear in the body,
// followed by the field messages in the order displayName, bio, avatarUrl (the messages the
// assistant already wrote). Keep the existing rules and messages for the three fields.
// Do not change the repository, the controller or the test runner.

type UpdateProfileDto = { displayName?: string; bio?: string; avatarUrl?: string };
type ValidationResult = { ok: true; dto: UpdateProfileDto } | { ok: false; errors: string[] };

const ALLOWED: Record<string, boolean> = { displayName: true, bio: true, avatarUrl: true };

// users/dto/update-profile.validation.ts: whitelist checked with the in operator
function validateUpdateProfile(body: unknown): ValidationResult {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return { ok: false, errors: ["body must be a JSON object"] };
    }
    const input = body as Record<string, unknown>;
    const { displayName, bio, avatarUrl } = input;
    const errors = Object.keys(input)
        .filter((key) => !(key in ALLOWED))
        .map((key) => `property ${key} should not exist`);

    if (displayName !== undefined) {
        if (typeof displayName !== "string") errors.push("displayName must be a string");
        else if (displayName.length < 1 || displayName.length > 50) errors.push("displayName must be between 1 and 50 characters");
    }
    if (bio !== undefined) {
        if (typeof bio !== "string") errors.push("bio must be a string");
        else if (bio.length > 280) errors.push("bio must be shorter than or equal to 280 characters");
    }
    if (avatarUrl !== undefined) {
        if (typeof avatarUrl !== "string" || !isHttpsUrl(avatarUrl)) errors.push("avatarUrl must be an https URL");
    }

    if (errors.length > 0) return { ok: false, errors };
    const dto: Record<string, unknown> = {};
    for (const key of Object.keys(input)) dto[key] = input[key];
    return { ok: true, dto: dto as UpdateProfileDto };
}

function isHttpsUrl(value: string): boolean {
    if (value.length > 2048) return false;
    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}
// ------------------------------------------------- repository and controller (do not change)
type UserRow = { id: string; displayName: string; bio: string; avatarUrl: string | null; role: string; isAdmin: boolean; exp: number };

// users/users.repository.ts: a fake of the database repository.
class UsersRepository {
    readonly rows = new Map<string, UserRow>([
        ["u1", { id: "u1", displayName: "Lan Tran", bio: "", avatarUrl: null, role: "learner", isAdmin: false, exp: 1240 }],
    ]);
    readonly calls: string[] = [];

    updateProfile(userId: string, changes: UpdateProfileDto): void {
        this.calls.push(`updateProfile(${userId}, ${JSON.stringify(changes)})`);
        const row = this.rows.get(userId);
        if (row) Object.assign(row, changes); // like an ORM merge: copies every property it is given
    }
}

// users/users.controller.ts: PATCH /users/me/profile for the signed-in user.
function patchMyProfile(users: UsersRepository, userId: string, rawBody: string): { status: number; body: string[] | string } {
    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return { status: 400, body: ["body must be valid JSON"] };
    }
    const result = validateUpdateProfile(body);
    if (!result.ok) return { status: 400, body: result.errors };
    users.updateProfile(userId, result.dto);
    return { status: 200, body: "updated" };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "userId": "u1", "body": "<the raw JSON text of the request body>" }.
// Prints the response, what the repository received, then the user row as stored.
function main(): void {
    const request: { userId: string; body: string } = JSON.parse(readFileSync(0, "utf8"));
    const users = new UsersRepository();
    const response = patchMyProfile(users, request.userId, request.body);
    console.log(`status ${response.status}: ${Array.isArray(response.body) ? response.body.join("; ") : response.body}`);
    console.log(`repository: ${users.calls.join(", ") || "not called"}`);
    for (const row of users.rows.values()) {
        const prototype = Object.getPrototypeOf(row) === Object.prototype ? "" : ", PROTOTYPE CHANGED";
        console.log(`${row.id}: displayName ${JSON.stringify(row.displayName)}, bio ${JSON.stringify(row.bio)}, avatarUrl ${JSON.stringify(row.avatarUrl)}, role ${row.role}, isAdmin ${row.isAdmin}, exp ${row.exp}${prototype}`);
    }
}
main();
