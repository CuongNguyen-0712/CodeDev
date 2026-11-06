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
    // [ ] Shift the instant to the learner's local date
}

function runBudget(input: BudgetInput): Outcome[] {
    // For each event, in order:
    // 1. find the learner; the day is the learner's local date of event.at (fixed UTC offset)
    // 2. check: is the estimate valid, and can the remaining budget of that day cover it?
    // 3. record: is the usage valid, and was this request id already recorded for this learner?
    // 4. remaining = the plan's daily tokens minus the tokens recorded that day, never below 0
    // [ ] Index the users and start the ledgers

    return input.events.map((event): Outcome => {
        // [ ] Find the learner, the day key and what is left

        switch (event.type) {
            case "check": {
                // [ ] Answer a check
            }
            case "record": {
                // [ ] Record usage once per request
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
