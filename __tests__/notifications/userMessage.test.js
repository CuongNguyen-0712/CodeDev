import { describe, expect, it } from "vitest";

import { GENERIC_MESSAGE, NETWORK_MESSAGE, TIMEOUT_MESSAGE, toUserError, userMessage } from "@/lib/userMessage";

describe("userMessage", () => {
    it("keeps messages written for users", () => {
        expect(userMessage("Not enough points to redeem this course.")).toBe("Not enough points to redeem this course.");
        expect(userMessage(new Error("This email is already used by another CodeDev account."))).toMatch(/already used/);
    });

    it("turns network and timeout failures into actionable sentences", () => {
        expect(userMessage("Network Error")).toBe(NETWORK_MESSAGE);
        expect(userMessage(new TypeError("Failed to fetch"))).toBe(NETWORK_MESSAGE);
        expect(userMessage("timeout of 10000ms exceeded")).toBe(TIMEOUT_MESSAGE);
    });

    it("never shows technical text", () => {
        for (const raw of [
            "Request failed with status code 502",
            'duplicate key value violates unique constraint "users_email_lower_uq"',
            "Cannot read properties of undefined (reading 'id')",
            "Unexpected token < in JSON at position 0",
            "An unexpected response was received from the server.",
        ]) {
            expect(userMessage(raw)).toBe(GENERIC_MESSAGE);
        }
        expect(userMessage("", "Could not save.")).toBe("Could not save.");
    });

    it("keeps status and code on the safe error", () => {
        const raw = Object.assign(new Error("Request failed with status code 500"), { status: 500, code: "X" });
        const safe = toUserError(raw, "Could not load courses.");
        expect(safe.message).toBe("Could not load courses.");
        expect(safe.status).toBe(500);
        expect(safe.code).toBe("X");
    });
});
