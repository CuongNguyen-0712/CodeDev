import { readFileSync } from "node:fs";

// Every AI tutor request goes through a daily token budget per learner. The old budget only
// subtracted an estimate, reset at midnight UTC and counted a retried record twice. Write
// runBudget(input): replay the events with the fake clock in each event's "at" and return one
// outcome per event. The full rules are in the challenge description. Do not change the types or the test runner.

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
    return new Date(Date.parse(at) + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function runBudget(input: BudgetInput): Outcome[] {
    const users = new Map(input.users.map((u) => [u.id, u]));
    const usedByDay = new Map<string, number>(); // "userId|day" -> tokens recorded that day
    const recorded = new Set<string>(); // "userId|requestId"

    return input.events.map((event): Outcome => {
        const user = users.get(event.userId);
        if (!user) return { ok: false, reason: "unknown user", remaining: null };
        const key = `${user.id}|${localDay(event.at, user.utcOffsetMinutes)}`;
        const remaining = () => Math.max(0, input.dailyTokens[user.plan] - (usedByDay.get(key) ?? 0));

        switch (event.type) {
            case "check": {
                if (!Number.isInteger(event.estimate) || event.estimate <= 0) return { ok: false, reason: "invalid estimate", remaining: remaining() };
                if (event.estimate > remaining()) return { ok: false, reason: "budget exceeded", remaining: remaining() };
                return { ok: true, reason: null, remaining: remaining() };
            }
            case "record": {
                if (!Number.isInteger(event.used) || event.used < 0) return { ok: false, reason: "invalid usage", remaining: remaining() };
                const requestKey = `${user.id}|${event.requestId}`;
                if (recorded.has(requestKey)) return { ok: false, reason: "duplicate", remaining: remaining() };
                recorded.add(requestKey);
                usedByDay.set(key, (usedByDay.get(key) ?? 0) + event.used);
                return { ok: true, reason: null, remaining: remaining() };
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
