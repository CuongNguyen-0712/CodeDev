import { describe, expect, it } from "vitest";

import { EMAIL_PATTERN, SignUpSchema } from "@/lib/definition";

describe("EMAIL_PATTERN", () => {
    it("accepts ordinary addresses and rejects malformed ones", () => {
        for (const ok of ["a@b.co", "x.y+z@mail.edu.vn", "first-last@sub.domain.io"]) expect(EMAIL_PATTERN.test(ok)).toBe(true);
        for (const bad of ["a@b", "a@b..c", "a@.b.c", "a@b.c.", "a b@c.d", "a@b@c.d", `${"a".repeat(250)}@b.co`]) {
            expect(EMAIL_PATTERN.test(bad)).toBe(false);
        }
    });

    it("rejects a huge input in linear time (the old pattern backtracked quadratically)", () => {
        const started = Date.now();
        expect(EMAIL_PATTERN.test(`a@${".".repeat(1_000_000)}@`)).toBe(false);
        expect(SignUpSchema.shape.email.safeParse(`a@${"b.".repeat(500_000)}@`).success).toBe(false);
        expect(Date.now() - started).toBeLessThan(500);
    });
});
