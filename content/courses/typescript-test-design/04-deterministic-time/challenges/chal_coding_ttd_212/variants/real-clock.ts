import { readFileSync } from "node:fs";

// Known wrong answer: the logic is right but it reads the real clock instead of the injected one.

type Assignment = { id: string; deadline: string; utcOffsetMinutes: number; graceMinutes: number };
type Clock = { now(): Date };
type Status = "on-time" | "late" | "closed" | "invalid";

const MINUTE = 60_000;

function deadlineInstant(a: Assignment): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(a.deadline);
    if (!m) return null;
    const [year, month, day, hour, minute] = m.slice(1).map(Number);
    const wall = Date.UTC(year, month - 1, day, hour, minute);
    const back = new Date(wall);
    // Date.UTC rolls 2026-02-29 over to March 1: a round trip that changes the fields means the date does not exist.
    if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day
        || back.getUTCHours() !== hour || back.getUTCMinutes() !== minute) return null;
    return wall - a.utcOffsetMinutes * MINUTE;
}

function submissionStatus(assignment: Assignment, clock: Clock): Status {
    if (!Number.isInteger(assignment.graceMinutes) || assignment.graceMinutes < 0) return "invalid";
    const due = deadlineInstant(assignment);
    if (due === null) return "invalid";
    const now = Date.now();
    if (now <= due) return "on-time";
    if (now <= due + assignment.graceMinutes * MINUTE) return "late";
    return "closed";
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of checks. Each check is one assignment and the instants at which a learner presses
// Submit. The runner builds a fixed clock for every instant and prints one line per instant.
type Check = { assignment: Assignment; at: string[] };

const checks: Check[] = JSON.parse(readFileSync(0, "utf8"));
for (const { assignment, at } of checks) {
    for (const instant of at) {
        const fixed = new Date(instant);
        const clock: Clock = { now: () => new Date(fixed.getTime()) };
        console.log(`${assignment.id} at ${instant}: ${submissionStatus(assignment, clock)}`);
    }
}
