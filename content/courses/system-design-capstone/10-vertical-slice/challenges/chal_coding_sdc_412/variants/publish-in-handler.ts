import { readFileSync } from "node:fs";

// The CodeDev vertical slice, end to end:
//   POST /lessons/:lessonId/complete -> progress service -> PostgreSQL (progress + outbox, one transaction)
//   -> outbox relay -> event bus (at least once) -> leaderboard consumer (Redis sorted set)
// Clients retry, the relay can die between publishing and marking, the bus redelivers. Every hop must be
// idempotent, so the same request or event applied twice changes nothing the second time.
//
// completeLesson(req, ctx)  the API handler and the progress service, in this order:
//   1. requestId, userId and lessonId must be non-empty strings, else { status: 400, error: "invalid_request" }
//   2. in ONE ctx.store.transaction, with the idempotency key "<userId>/<requestId>":
//      - a saved request with the same lessonId: return its saved response unchanged
//      - a saved request with another lessonId: { status: 422, error: "request_id_reused" }
//      - lessonId not in ctx.lessonPoints: { status: 404, error: "unknown_lesson" } (not saved)
//      - lesson already completed: { status: 200, lessonId, newlyCompleted: false, totalPoints }
//      - otherwise add the lesson and its points to the progress, append the outbox event
//        { eventId: "lesson-completed:<userId>:<lessonId>", userId, lessonId, points } and answer
//        { status: 200, lessonId, newlyCompleted: true, totalPoints }
//      - save every 200 response under the key, in the same transaction
// relayOutbox(ctx)          publish each unpublished outbox row in seq order, then mark it published
// onLessonCompleted(e, ctx) in one ctx.board.atomically: skip an eventId already processed, otherwise
//                           mark it processed and add its points to the learner's score
// Do not change the types, the fakes or the test runner.

type CompleteLessonRequest = { requestId: string; userId: string; lessonId: string };
type ApiResponse =
    | { status: 200; lessonId: string; newlyCompleted: boolean; totalPoints: number }
    | { status: 400 | 404 | 422; error: string };
type Progress = { completed: string[]; points: number };
type LessonCompleted = { eventId: string; userId: string; lessonId: string; points: number };
type SavedRequest = { lessonId: string; response: ApiResponse };

interface ProgressTx {
    getProgress(userId: string): Progress | null;
    putProgress(userId: string, progress: Progress): void;
    getRequest(key: string): SavedRequest | null;
    putRequest(key: string, saved: SavedRequest): void;
    appendOutbox(event: LessonCompleted): void;
}
interface ProgressStore {
    /** Every write inside `work` commits together when it returns; a throw discards them all. */
    transaction<T>(work: (tx: ProgressTx) => T): T;
    unpublished(): { seq: number; event: LessonCompleted }[];
    markPublished(seq: number): void;
}
interface EventBus {
    publish(event: LessonCompleted): void;
}
interface BoardTx {
    isProcessed(eventId: string): boolean;
    markProcessed(eventId: string): void;
    incrementBy(userId: string, points: number): void;
}
interface Leaderboard {
    /** Like a Redis Lua script: every write inside `work` applies together or not at all. */
    atomically(work: (board: BoardTx) => void): void;
}
type Ctx = { store: ProgressStore; bus: EventBus; board: Leaderboard; lessonPoints: Record<string, number> };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function completeLesson(req: CompleteLessonRequest, ctx: Ctx): ApiResponse {
    if (!req || !isId(req.requestId) || !isId(req.userId) || !isId(req.lessonId)) {
        return { status: 400, error: "invalid_request" };
    }
    const { requestId, userId, lessonId } = req;
    const key = `${userId}/${requestId}`;
    return ctx.store.transaction((tx): ApiResponse => {
        const saved = tx.getRequest(key);
        if (saved) return saved.lessonId === lessonId ? saved.response : { status: 422, error: "request_id_reused" };
        if (!Object.prototype.hasOwnProperty.call(ctx.lessonPoints, lessonId)) return { status: 404, error: "unknown_lesson" };

        const progress = tx.getProgress(userId) ?? { completed: [], points: 0 };
        let response: ApiResponse;
        if (progress.completed.includes(lessonId)) {
            response = { status: 200, lessonId, newlyCompleted: false, totalPoints: progress.points };
        } else {
            const points = ctx.lessonPoints[lessonId];
            const next = { completed: [...progress.completed, lessonId], points: progress.points + points };
            tx.putProgress(userId, next);
            ctx.bus.publish({ eventId: `lesson-completed:${userId}:${lessonId}`, userId, lessonId, points });
            response = { status: 200, lessonId, newlyCompleted: true, totalPoints: next.points };
        }
        tx.putRequest(key, { lessonId, response });
        return response;
    });
}

function relayOutbox(ctx: Ctx): void {
    for (const row of ctx.store.unpublished()) {
        ctx.bus.publish(row.event);
        ctx.store.markPublished(row.seq);
    }
}

function onLessonCompleted(event: LessonCompleted, ctx: Ctx): void {
    ctx.board.atomically((board) => {
        if (board.isProcessed(event.eventId)) return;
        board.markProcessed(event.eventId);
        board.incrementBy(event.userId, event.points);
    });
}

// ---------------------------------------------------------------- fakes and test runner (do not change)
// Input: { lessonPoints, script }. Each script step is one of:
//   { request, crash? }                          POST /lessons/:lessonId/complete; crash "beforeCommit" kills the
//                                                process just before its first transaction commits, "afterCommit"
//                                                right after it commits (the client never gets the response)
//   { relay: true, crashAtPublish?, crashAfterPublish? }  run relayOutbox; the process dies at the Nth publish
//                                                of this step, before or after the message reaches the bus
//   { deliver: true, crashBeforeAck? }            the bus delivers its queue to onLessonCompleted, in order; the
//                                                process dies after handling the Nth message, before its ack
// A message that was not acked stays at the head of the queue and is delivered again. After the script a final
// replay runs relayOutbox and delivers the whole queue with no crash.
// Output: the responses (or "connection lost"), the final progress, the outbox events and the board.
class Crash extends Error {}
type CrashPoint = "beforeCommit" | "afterCommit";
type Step = {
    request?: CompleteLessonRequest;
    crash?: CrashPoint;
    relay?: boolean;
    crashAtPublish?: number;
    crashAfterPublish?: number;
    deliver?: boolean;
    crashBeforeAck?: number;
};
type Input = { lessonPoints: Record<string, number>; script: Step[] };

const copy = <V>(value: V): V => JSON.parse(JSON.stringify(value));

class FakeProgressStore implements ProgressStore {
    progress = new Map<string, Progress>();
    requests = new Map<string, SavedRequest>();
    outbox: { seq: number; event: LessonCompleted; published: boolean }[] = [];
    crash: CrashPoint | null = null;

    transaction<T>(work: (tx: ProgressTx) => T): T {
        const progress = new Map<string, Progress>();
        const requests = new Map<string, SavedRequest>();
        const outbox: LessonCompleted[] = [];
        const tx: ProgressTx = {
            getProgress: (userId) => copy(progress.get(userId) ?? this.progress.get(userId) ?? null),
            putProgress: (userId, p) => void progress.set(userId, copy(p)),
            getRequest: (key) => copy(requests.get(key) ?? this.requests.get(key) ?? null),
            putRequest: (key, saved) => void requests.set(key, copy(saved)),
            appendOutbox: (event) => void outbox.push(copy(event)),
        };
        const result = work(tx);
        const crash = this.crash;
        this.crash = null;
        if (crash === "beforeCommit") throw new Crash("process crashed before commit");
        for (const [k, v] of progress) this.progress.set(k, v);
        for (const [k, v] of requests) this.requests.set(k, v);
        for (const event of outbox) this.outbox.push({ seq: this.outbox.length + 1, event, published: false });
        if (crash === "afterCommit") throw new Crash("process crashed after commit");
        return result;
    }
    unpublished() {
        return this.outbox.filter((row) => !row.published).map((row) => ({ seq: row.seq, event: copy(row.event) }));
    }
    markPublished(seq: number): void {
        const row = this.outbox.find((r) => r.seq === seq);
        if (row) row.published = true;
    }
}

class FakeBus implements EventBus {
    queue: LessonCompleted[] = [];
    count = 0;
    crashAt = 0;
    crashAfter = 0;
    publish(event: LessonCompleted): void {
        this.count++;
        if (this.count === this.crashAt) throw new Crash("process crashed while publishing");
        this.queue.push(copy(event));
        if (this.count === this.crashAfter) throw new Crash("process crashed after publishing");
    }
}

class FakeBoard implements Leaderboard {
    scores = new Map<string, number>();
    processed = new Set<string>();
    atomically(work: (board: BoardTx) => void): void {
        const scores = new Map<string, number>();
        const processed = new Set<string>();
        work({
            isProcessed: (id) => processed.has(id) || this.processed.has(id),
            markProcessed: (id) => void processed.add(id),
            incrementBy: (userId, points) => void scores.set(userId, (scores.get(userId) ?? this.scores.get(userId) ?? 0) + points),
        });
        for (const [k, v] of scores) this.scores.set(k, v);
        for (const id of processed) this.processed.add(id);
    }
}

function main(): void {
    const input = JSON.parse(readFileSync(0, "utf8")) as Input;
    const store = new FakeProgressStore();
    const bus = new FakeBus();
    const board = new FakeBoard();
    const ctx: Ctx = { store, bus, board, lessonPoints: input.lessonPoints };
    const responses: unknown[] = [];
    const errors: string[] = [];
    const fail = (err: unknown): void => {
        if (!(err instanceof Crash)) errors.push(err instanceof Error ? err.message : String(err));
    };
    const deliver = (crashBeforeAck = 0): void => {
        let handled = 0;
        while (bus.queue.length > 0) {
            onLessonCompleted(copy(bus.queue[0]), ctx);
            handled++;
            if (handled === crashBeforeAck) throw new Crash("process crashed before ack");
            bus.queue.shift();
        }
    };

    for (const step of input.script) {
        store.crash = null;
        bus.count = 0;
        bus.crashAt = step.crashAtPublish ?? 0;
        bus.crashAfter = step.crashAfterPublish ?? 0;
        try {
            if (step.request !== undefined) {
                store.crash = step.crash ?? null;
                try {
                    responses.push(completeLesson(copy(step.request), ctx));
                } catch (err) {
                    responses.push(err instanceof Crash ? "connection lost" : `error: ${err instanceof Error ? err.message : String(err)}`);
                }
            } else if (step.relay) {
                relayOutbox(ctx);
            } else if (step.deliver) {
                deliver(step.crashBeforeAck ?? 0);
            }
        } catch (err) {
            fail(err);
        }
    }
    store.crash = null;
    bus.crashAt = 0;
    bus.crashAfter = 0;
    try {
        relayOutbox(ctx);
        deliver();
    } catch (err) {
        fail(err);
    }

    const progress: Record<string, Progress> = {};
    for (const userId of [...store.progress.keys()].sort()) {
        const p = store.progress.get(userId)!;
        progress[userId] = { completed: [...p.completed].sort(), points: p.points };
    }
    console.log(JSON.stringify({
        responses,
        progress,
        events: store.outbox.map((row) => row.event.eventId),
        board: [...board.scores].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
        errors,
    }, null, 2));
}
main();
