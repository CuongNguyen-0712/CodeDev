import { describe, expect, it } from "vitest";
import { NOTIFICATION_FALLBACK, notificationKind } from "@/constants/notifications";

describe("notificationKind", () => {
    it.each(["friend_request", "friend_accepted"])("%s has its own icon", (kind) => {
        expect(notificationKind(kind)).not.toBe(NOTIFICATION_FALLBACK);
    });

    it("falls back for unknown kinds", () => {
        expect(notificationKind("nope")).toBe(NOTIFICATION_FALLBACK);
    });
});
