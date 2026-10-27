import { readFileSync } from "node:fs";

// CodeDev assignments: may a learner still submit?
//
// The version that shipped read the clock inside the function, so its tests could only use "now":
//
//     function submissionStatus(assignment: Assignment): Status {
//         const now = new Date();
//         const today = now.toISOString().slice(0, 10);          // the UTC date, not the learner's
//         ...
//     }
//
// Its test built "today at 23:59" from the real clock and failed every night between 00:00 and
// 07:00 Vietnam time, when the UTC date is still yesterday.
//
// Write submissionStatus(assignment, clock) so that it reads the time ONLY from clock.now():
//   - assignment.deadline is a wall-clock time "YYYY-MM-DDTHH:mm" in the learner's fixed UTC offset,
//     assignment.utcOffsetMinutes (420 = UTC+7, 0 = UTC, -300 = UTC-5). The deadline instant is
//     that wall time at second 0 in that offset ("2026-10-31T23:59" at +420 = 2026-10-31T16:59:00.000Z).
//   - "on-time"  when now <= deadline
//   - "late"     when deadline < now <= deadline + graceMinutes
//   - "closed"   when now > deadline + graceMinutes
//   - "invalid"  when the deadline does not match YYYY-MM-DDTHH:mm, is not a real date and time
//     (2026-02-29T10:00, 2026-10-31T24:00), or graceMinutes is not a whole number >= 0.
// Do not call new Date() or Date.now() for the current time. Do not change the types or the test runner.

type Assignment = { id: string; deadline: string; utcOffsetMinutes: number; graceMinutes: number };
type Clock = { now(): Date };
type Status = "on-time" | "late" | "closed" | "invalid";

function submissionStatus(assignment: Assignment, clock: Clock): Status {
    return "on-time";
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
