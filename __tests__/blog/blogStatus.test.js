import { describe, expect, it } from "vitest";

import { nextStatus } from "@/lib/blog/status.mjs";

const run = (o) => nextStatus({ trusted: false, appealing: false, appealedAt: null, submit: false, ...o });

describe("nextStatus", () => {
    it("create as draft", () => expect(run({ current: null })).toEqual({ status: "draft", appeal: false }));
    it("create+submit untrusted -> pending", () => expect(run({ current: null, submit: true }).status).toBe("pending"));
    it("create+submit trusted -> published", () => expect(run({ current: null, submit: true, trusted: true }).status).toBe("published"));
    it("draft submit", () => expect(run({ current: "draft", submit: true }).status).toBe("pending"));
    it("rejected submit trusted", () => expect(run({ current: "rejected", submit: true, trusted: true }).status).toBe("published"));
    it("draft save", () => expect(run({ current: "draft" }).status).toBe("draft"));
    it("rejected save -> draft", () => expect(run({ current: "rejected" }).status).toBe("draft"));
    it("pending stays pending", () => expect(run({ current: "pending", submit: true }).status).toBe("pending"));
    it("pending under appeal review -> 409", () => {
        expect(() => run({ current: "pending", appealedAt: new Date() })).toThrow(expect.objectContaining({ status: 409, message: "This post is under review" }));
    });
    it("published stays published", () => expect(run({ current: "published" }).status).toBe("published"));
    it("hidden first appeal -> pending", () => expect(run({ current: "hidden", appealing: true })).toEqual({ status: "pending", appeal: true }));
    it("hidden without appeal -> 403", () => {
        expect(() => run({ current: "hidden" })).toThrow(expect.objectContaining({ status: 403 }));
    });
    it("hidden second appeal -> 403", () => {
        expect(() => run({ current: "hidden", appealing: true, appealedAt: new Date() })).toThrow(expect.objectContaining({ status: 403 }));
    });
});
