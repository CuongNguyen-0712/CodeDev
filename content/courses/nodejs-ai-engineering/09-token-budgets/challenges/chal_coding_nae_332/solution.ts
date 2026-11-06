import { readFileSync } from "node:fs";

// Every AI tutor request goes through a daily token budget per learner. The old budget only
// subtracted an estimate, reset at midnight UTC and counted a retried record twice. Fill
// runBudget(input) with pieces (some are wrong): replay the events with the fake clock in each
// event's "at" and return one outcome per event. The full rules are in the challenge description.
// Do not change the types or the test runner.

type Plan = "free" | "premium";

type User = { id: string; plan: Plan; utcOffsetMinutes: number };

type BudgetEvent =
    | { type: "check"; at: string; userId: string; requestId: string; estimate: number }
    | { type: "record"; at: string; userId: string; requestId: string; used: number }
    | { type: "remaining"; at: string; userId: string };

type BudgetInput = {
    dailyTokens: Record<Plan, number>;
    users: User[];
    events: BudgetEvent[];
};

type Outcome = { ok: boolean; reason: string | null; remaining: number | null };

/** The learner's local calendar date, e.g. "2026-10-27", for a UTC instant and a fixed offset. */
function localDay(at: string, utcOffsetMinutes: number): string {
    // @piece local-day: Shift the instant to the learner's local date
    return new Date(Date.parse(at) + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
    // @end
}

function runBudget(input: BudgetInput): Outcome[] {
    // For each event, in order:
    // 1. find the learner; the day is the learner's local date of event.at (fixed UTC offset)
    // 2. check: is the estimate valid, and can the remaining budget of that day cover it?
    // 3. record: is the usage valid, and was this request id already recorded for this learner?
    // 4. remaining = the plan's daily tokens minus the tokens recorded that day, never below 0
    // @piece state: Index the users and start the ledgers
    const users = new Map(input.users.map((u) => [u.id, u]));
    const usedByDay = new Map<string, number>(); // "userId|day" -> tokens recorded that day
    const recorded = new Set<string>(); // "userId|requestId"
    // @end

    return input.events.map((event): Outcome => {
        // @piece user-and-day: Find the learner, the day key and what is left
        const user = users.get(event.userId);
        if (!user) return { ok: false, reason: "unknown user", remaining: null };
        const key = `${user.id}|${localDay(event.at, user.utcOffsetMinutes)}`;
        const remaining = () => Math.max(0, input.dailyTokens[user.plan] - (usedByDay.get(key) ?? 0));
        // @end

        switch (event.type) {
            case "check": {
                // @piece check-event: Answer a check
                if (!Number.isInteger(event.estimate) || event.estimate <= 0) return { ok: false, reason: "invalid estimate", remaining: remaining() };
                if (event.estimate > remaining()) return { ok: false, reason: "budget exceeded", remaining: remaining() };
                return { ok: true, reason: null, remaining: remaining() };
                // @end
            }
            case "record": {
                // @piece record-event: Record usage once per request
                if (!Number.isInteger(event.used) || event.used < 0) return { ok: false, reason: "invalid usage", remaining: remaining() };
                const requestKey = `${user.id}|${event.requestId}`;
                if (recorded.has(requestKey)) return { ok: false, reason: "duplicate", remaining: remaining() };
                recorded.add(requestKey);
                usedByDay.set(key, (usedByDay.get(key) ?? 0) + event.used);
                return { ok: true, reason: null, remaining: remaining() };
                // @end
            }
            case "remaining":
                return { ok: true, reason: null, remaining: remaining() };
        }
    });
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: one BudgetInput as JSON. Output: the outcome of every event, in order, as JSON.
const input: BudgetInput = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(runBudget(input)));
