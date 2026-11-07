import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * session.revoked and web push (docs/superpowers/specs/2026-11-07-beams-web-push-design.md 5.4):
 * a session revoked from elsewhere drops the user's Beams devices on every attempt; a plain logout does not
 * (that device stops itself), and a Beams failure never fails the event.
 */
let row;
const sessionDb = {
    claimOutbox: vi.fn(async () => [row]),
    completeOutbox: vi.fn(async () => {}),
    failOutbox: vi.fn(async () => ({ dead: false })),
};
const deleteBeamsUser = vi.fn(async () => true);

vi.mock("@/db/session.db", () => ({ sessionDb }));
vi.mock("@/db/emailToken.db", () => ({ emailTokenDb: {} }));
vi.mock("@/db/deadLetter.db", () => ({ deadLetterDb: { record: vi.fn(async () => {}) } }));
vi.mock("@/lib/cache", () => ({ redis: { setOrThrow: vi.fn(async () => {}) } }));
vi.mock("@/lib/pusher", () => ({ publishToUser: vi.fn(async () => true) }));
vi.mock("@/lib/inngest", () => ({ inngest: { send: vi.fn() }, outboxViaInngest: () => false }));
vi.mock("@/lib/beams", () => ({ deleteBeamsUser: (...a) => deleteBeamsUser(...a) }));

const { processAuthOutbox } = await import("@/services/authOutbox.service");

const revoked = ({ reason = "revoked", attempts = 1 } = {}) => ({
    id: 1, event_type: "session.revoked", attempts, payload: { userId: "P1", sessionIds: ["s1"], reason },
});

beforeEach(() => {
    vi.clearAllMocks();
    deleteBeamsUser.mockResolvedValue(true);
});

describe("session.revoked and Beams", () => {
    it("remote revoke removes the user's push devices once", async () => {
        row = revoked();
        await processAuthOutbox({ ids: [1] });
        expect(deleteBeamsUser).toHaveBeenCalledTimes(1);
        expect(deleteBeamsUser).toHaveBeenCalledWith("P1");
    });

    it("a plain logout keeps them", async () => {
        row = revoked({ reason: "logout" });
        await processAuthOutbox({ ids: [1] });
        expect(deleteBeamsUser).not.toHaveBeenCalled();
    });

    it("a retry deletes again: the delete is idempotent and attempt 1 may have failed", async () => {
        row = revoked({ attempts: 2 });
        await processAuthOutbox({ ids: [1] });
        expect(deleteBeamsUser).toHaveBeenCalledWith("P1");
    });

    it("a Beams failure does not fail the event", async () => {
        row = revoked();
        deleteBeamsUser.mockResolvedValue(false);
        expect(await processAuthOutbox({ ids: [1] })).toEqual({ processed: 1, failed: 0 });
    });
});
