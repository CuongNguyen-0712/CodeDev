import { describe, expect, it } from "vitest";

import { SEARCH_MAX, parseScope } from "@/lib/adminSearch";

describe("parseScope (Ctrl+K scope prefixes)", () => {
    it("maps each prefix to its type and strips it", () => {
        expect(parseScope("user: alice")).toEqual({ type: "user", q: "alice" });
        expect(parseScope("course:intro-js")).toEqual({ type: "course", q: "intro-js" });
        expect(parseScope("challenge:  two sum ")).toEqual({ type: "challenge", q: "two sum" });
        expect(parseScope("order: ord_123")).toEqual({ type: "order", q: "ord_123" });
        expect(parseScope("run:01JCABCDEF")).toEqual({ type: "run", q: "01JCABCDEF" });
    });

    it("is case-insensitive and allows leading spaces", () => {
        expect(parseScope("  USER: Bob")).toEqual({ type: "user", q: "Bob" });
    });

    it("leaves unknown or mid-text prefixes in the query", () => {
        expect(parseScope("lesson: x")).toEqual({ type: null, q: "lesson: x" });
        expect(parseScope("find user: x")).toEqual({ type: null, q: "find user: x" });
        expect(parseScope("users: x")).toEqual({ type: null, q: "users: x" });
    });

    it("trims and cuts the query to the maximum length", () => {
        expect(parseScope("   ")).toEqual({ type: null, q: "" });
        expect(parseScope("user:")).toEqual({ type: "user", q: "" });
        expect(parseScope(`run: ${"a".repeat(150)}`).q).toHaveLength(SEARCH_MAX);
        expect(parseScope(null)).toEqual({ type: null, q: "" });
    });
});
