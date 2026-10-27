import { readFileSync } from "node:fs";

// CodeDev learning streaks: the profile page shows the learner's current streak and longest streak,
// counted in consecutive *local* calendar days with at least one completed lesson. The version an
// AI assistant wrote worked in every demo and broke for learners in Vietnam, for learners who study
// twice a day and for learners who study late at night. Write it again.
//
// computeStreaks(completedAt, offsetMinutes, now):
//   completedAt     lesson-completion timestamps, ISO 8601 with an offset, for example
//                   "2026-10-21T06:30:00+07:00" or "2026-10-20T23:30:00Z", in any order, possibly
//                   with several on the same day. An entry for which Date.parse returns NaN
//                   ("", "yesterday", "2026-13-01T08:00:00Z") is ignored. No timestamp is later than now.
//   offsetMinutes   the learner's fixed UTC offset in minutes: 420 for UTC+07:00, -300 for UTC-05:00,
//                   330 for UTC+05:30 (between -720 and 840). No daylight saving time: use the offset as is.
//   now             the current instant, ISO 8601 (always valid).
//
//   The local day of an instant is its calendar date at UTC + offsetMinutes. A day counts when at
//   least one completion falls on it; several completions on the same day count once.
//   longest  the greatest number of consecutive local days that count (0 when none count)
//   current  the length of the run of consecutive counted days that ends today or yesterday
//            (local days of now); 0 when the last counted day is older than yesterday. A learner
//            who has not studied yet today keeps the streak until the end of the day.
//
// Constraints: up to 5000 timestamps; dates between 1990 and 2100.
// Do not use Intl or the runner's local time zone (getDate, getHours, toDateString, ...): the
// offset is the only time zone. Do not change the types or the test runner.

type Streaks = { current: number; longest: number };

function computeStreaks(completedAt: string[], offsetMinutes: number, now: string): Streaks {
    const toDay = (ts: string) => new Date(ts).toISOString().slice(0, 10);
    const days = [...new Set(completedAt.filter((t) => !Number.isNaN(Date.parse(t))).map(toDay))].sort();
    const dayNumber = (d: string) => Date.parse(d + "T00:00:00Z") / 86_400_000;
    let longest = 0;
    let run = 0;
    let previous = Number.NaN;
    for (const d of days) {
        const n = dayNumber(d);
        run = n === previous + 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
        previous = n;
    }
    const today = dayNumber(toDay(now));
    return { current: days.length > 0 && previous >= today - 1 ? run : 0, longest };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { cases: [{ completedAt, offsetMinutes, now }] }. Output: one { current, longest } per case.
type Case = { completedAt: string[]; offsetMinutes: number; now: string };

const { cases }: { cases: Case[] } = JSON.parse(readFileSync(0, "utf8"));
const results = cases.map((c) => {
    const r = computeStreaks(c.completedAt, c.offsetMinutes, c.now);
    return { current: r.current, longest: r.longest };
});
console.log(JSON.stringify(results));
