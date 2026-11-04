import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin announcements (docs/notification-plan.md 3): audience checks before anything is written,
 * scheduling only with the queue, batches until a short one, and who gets told to refetch.
 */
const db = {
    countAudience: vi.fn(async () => 3),
    resolveUsers: vi.fn(),
    courseExists: vi.fn(async () => true),
    create: vi.fn(async (_client, input) => ({ id: "a1", status: "scheduled", send_at: new Date().toISOString(), ...input })),
    get: vi.fn(async () => ({ id: "a1", status: "sent" })),
    startSending: vi.fn(),
    deliverBatch: vi.fn(),
    finishSending: vi.fn(),
    transition: vi.fn(),
    retractCopies: vi.fn(async () => ({ rowCount: 2 })),
    list: vi.fn(),
    listOverdue: vi.fn(async () => ({ rows: [] })),
};
vi.mock("@/db/announcement.db", () => ({ announcementDb: db }));
vi.mock("@/db/admin.db", () => ({ adminDb: { audit: vi.fn(async () => {}) } }));
vi.mock("@/lib/dbTransaction", () => ({ withTransaction: (fn) => fn({}) }));
let queueOn = false;
const send = vi.fn(async () => {});
vi.mock("@/lib/inngest", () => ({ inngest: { send: (...a) => send(...a) }, inngestEnabled: () => queueOn }));
const publish = vi.fn();
const publishToUser = vi.fn();
vi.mock("@/lib/pusher", () => ({ publish: (...a) => publish(...a), publishToUser: (...a) => publishToUser(...a) }));

const { announcementService, BATCH } = await import("@/services/announcement.service");

const actor = { id: "1" };
const input = (extra = {}) => ({ title: "Maintenance", body: "Down at 22:00", link: "", audience: { type: "all" }, ...extra });

beforeEach(() => {
    vi.clearAllMocks();
    queueOn = false;
    db.countAudience.mockResolvedValue(3);
});

describe("create", () => {
    it("refuses an audience nobody is in", async () => {
        db.countAudience.mockResolvedValueOnce(0);
        await expect(announcementService.create({ actor, input: input() })).rejects.toMatchObject({ status: 422 });
        expect(db.create).not.toHaveBeenCalled();
    });

    it("names the users it does not know and resolves usernames to public ids", async () => {
        db.resolveUsers.mockResolvedValueOnce({ rows: [{ public_id: "P1", username: "alice" }] });
        await expect(announcementService.create({ actor, input: input({ audience: { type: "users", userIds: ["alice", "ghost"] } }) }))
            .rejects.toMatchObject({ status: 422, message: expect.stringContaining("ghost") });

        db.resolveUsers.mockResolvedValueOnce({ rows: [{ public_id: "P1", username: "alice" }] });
        db.startSending.mockResolvedValueOnce(null);
        await announcementService.create({ actor, input: input({ audience: { type: "users", userIds: ["alice", "P1"] } }) });
        expect(db.create).toHaveBeenCalledWith({}, expect.objectContaining({ audience: { type: "users", userIds: ["P1"] }, link: null, sendAt: null }));
    });

    it("cannot schedule without the queue; with it, the event carries sendAt", async () => {
        const later = new Date(Date.now() + 3_600_000).toISOString();
        await expect(announcementService.create({ actor, input: input({ sendAt: later }) })).rejects.toMatchObject({ status: 422 });

        queueOn = true;
        await announcementService.create({ actor, input: input({ sendAt: later }) });
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: "announcement-a1", name: "announcement/send", data: expect.objectContaining({ id: "a1" }) }));
        expect(send.mock.calls[0][0].data.sendAt).not.toBeNull();
        expect(db.startSending).not.toHaveBeenCalled();
    });

    it("refuses a schedule more than 30 days ahead", async () => {
        queueOn = true;
        const far = new Date(Date.now() + 40 * 86_400_000).toISOString();
        await expect(announcementService.create({ actor, input: input({ sendAt: far }) })).rejects.toMatchObject({ status: 422 });
    });
});

describe("deliver", () => {
    it("copies in batches until a short one, then pings once on the broadcast channel", async () => {
        const announcement = { id: "a1", audience: { type: "all" } };
        db.startSending.mockResolvedValueOnce(announcement);
        db.deliverBatch
            .mockResolvedValueOnce({ lastId: "100", selected: BATCH, inserted: BATCH })
            .mockResolvedValueOnce({ lastId: "200", selected: 7, inserted: 7 });
        db.finishSending.mockResolvedValueOnce({ id: "a1", audience: { type: "all" }, recipients: BATCH + 7 });

        expect(await announcementService.deliver("a1")).toEqual({ id: "a1", recipients: BATCH + 7 });
        expect(db.deliverBatch).toHaveBeenNthCalledWith(2, { announcement, afterId: "100", limit: BATCH });
        expect(publish).toHaveBeenCalledWith("broadcast", "announcement", { id: "a1" });
        expect(publishToUser).not.toHaveBeenCalled();
    });

    it("pings each named user directly", async () => {
        db.finishSending.mockResolvedValueOnce({ id: "a2", audience: { type: "users", userIds: ["P1", "P2"] }, recipients: 2 });
        await announcementService.finish("a2");
        expect(publishToUser).toHaveBeenCalledTimes(2);
        expect(publishToUser).toHaveBeenCalledWith("P1", "notification-created", { id: "a2", kind: "announcement" });
        expect(publish).not.toHaveBeenCalled();
    });

    it("does nothing for a cancelled announcement", async () => {
        db.startSending.mockResolvedValueOnce(null);
        expect(await announcementService.deliver("a1")).toBeNull();
        expect(db.deliverBatch).not.toHaveBeenCalled();
    });
});

describe("cancel and retract", () => {
    it("cancel needs a scheduled announcement", async () => {
        db.transition.mockResolvedValueOnce(null);
        await expect(announcementService.cancel({ actor, id: "a1" })).rejects.toMatchObject({ status: 409 });
    });

    it("retract hides every copy and tells the recipients", async () => {
        db.transition.mockResolvedValueOnce({ id: "a1", audience: { type: "role", roles: ["student"] } });
        await announcementService.retract({ actor, id: "a1", reason: "wrong date" });
        expect(db.retractCopies).toHaveBeenCalledWith({}, "a1");
        expect(publish).toHaveBeenCalledWith("broadcast", "announcement", { id: "a1" });
    });
});
