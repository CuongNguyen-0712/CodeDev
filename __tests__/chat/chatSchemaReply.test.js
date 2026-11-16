import { describe, expect, it } from "vitest";

import { sendMessageSchema } from "@/lib/validation/chat";

const base = { toUserId: "u1", clientId: "6f1c9a2e-4b7d-4e3a-8c5f-2d9b1a7e3c40", body: "hi" };

describe("sendMessageSchema replyToId", () => {
    it("is optional and must be a message id", () => {
        expect(sendMessageSchema.safeParse(base).success).toBe(true);
        expect(sendMessageSchema.safeParse({ ...base, replyToId: `msg_${"a".repeat(26)}` }).success).toBe(true);
        expect(sendMessageSchema.safeParse({ ...base, replyToId: "cnv_x" }).success).toBe(false);
    });
});
