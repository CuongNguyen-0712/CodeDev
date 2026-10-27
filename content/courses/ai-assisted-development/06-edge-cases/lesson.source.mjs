// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-2-3",
    title: "Edge cases the AI forgets: empty input, time zones & large data",
    slug: { _type: "slug", current: "edge-cases-the-ai-forgets" },
    description:
        "The learning-streak counter an AI assistant wrote passed its demo and then told a learner in Vietnam with twelve days in a row that her current streak was 0 and her longest was 2. Learn why generated code fits the happy path of your examples, the edge cases to list before you prompt (empty, duplicates, order, day boundaries and offsets, invalid input, large input), how a calendar day depends on a time zone, how to write the edge cases as tests the assistant must pass, and when to stop prompting and write the core rule yourself.",
    estimatedTime: 25,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "Support receives the same complaint from several learners in Vietnam: \"I studied every day this week and my streak keeps going back to 0.\" One learner, Linh, has completed at least one lesson on each of the last twelve days, early in the morning before work or late in the evening, and her profile at https://app.codedev.test/profile shows a current streak of 0 and a longest streak of 2. The streak counter was written with an AI assistant two sprints ago. It passed the demo, its unit test and code review; the demo account studied once a day at 10:00 UTC.",
    },

    content: [
        h2("1. The incident: twelve days in a row, longest streak 2"),
        p("The request to the assistant was: \"Write computeStreaks(completedAt, now) that returns the learner's current and longest streak of consecutive days with a completed lesson.\" This is what was merged:"),
        code("typescript", `
// src/lib/streaks.ts - generated, merged after the demo
export function computeStreaks(completedAt: string[], now: string) {
  const days = completedAt.map((ts) => new Date(ts).toISOString().slice(0, 10));
  let current = 1;
  let longest = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = (Date.parse(days[i]) - Date.parse(days[i - 1])) / 86_400_000;
    if (gap === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  const today = new Date(now).toISOString().slice(0, 10);
  if (days.at(-1) !== today) current = 0;
  return { current, longest };
}`, "src/lib/streaks.ts (as merged)"),
        p("It reads well, and it was tested - with the demo account's history: one completion per day, at 10:00 UTC, returned in order. On that data every line is correct. Every assumption it makes is invisible until a learner breaks it."),

        h2("2. Read the evidence: one learner's week"),
        p("The API returns completion times in UTC. Linh lives in Ho Chi Minh City, UTC+07:00. Put her last few rows next to what the code computes and what she experienced:"),
        code("text", `
completed_at (API, UTC)   Linh's local time        code's "day"   Linh's day
2026-10-18T14:00:00Z      18 Oct 21:00             2026-10-18     18 Oct
2026-10-18T23:30:00Z      19 Oct 06:30             2026-10-18     19 Oct
2026-10-20T00:00:00Z      20 Oct 07:00             2026-10-20     20 Oct
2026-10-20T23:45:00Z      21 Oct 06:45             2026-10-20     21 Oct
2026-10-21T15:10:00Z      21 Oct 22:10             2026-10-21     21 Oct

now: 2026-10-22T01:00:00Z (22 Oct 08:00 for Linh, before her first lesson)`, "GET /users/u_4812/completions, last rows"),
        p("Four separate problems show up in five rows:"),
        bullets([
            "**Days are UTC days.** `toISOString()` always formats in UTC, so her 06:30 lesson on 19 October lands on 18 October, and 19 October looks empty. The gap breaks the streak.",
            "**Two lessons on one day reset the streak.** Two rows map to the same day, the gap is 0, and the `else` branch sets `current = 1`.",
            "**The order is assumed.** The code compares each row with the one before it. The API sorts by `completed_at` today; a different index, a merge of two sources or a retry that inserts late would make the result wrong without any error.",
            "**\"Current\" requires a lesson today.** At 08:00 she has not studied yet, so `current` becomes 0 - although her streak is not broken until the day ends.",
        ]),
        p("And one more that no learner has reported yet: for a new learner with no completions, the function returns `longest: 1`."),

        h2("3. Core idea: generated code fits the examples it was given"),
        p("An assistant writes the most likely code for the request and the context it sees. The request said \"consecutive days\" and nothing about whose days, duplicates, order or empty input, and the most common shape of streak code it could imitate handles none of them. The demo data then confirmed the happy path. None of this is specific to AI - human code has the same blind spots - but generated code arrives fast, looks finished and is easy to accept after one demo. The edges have to come from you."),
        p("The fix is not \"prompt harder\". It is to decide the rules and the edge cases **before** any code exists, write them down as tests (lesson 1.2), and let the tests decide whether the code - yours or the assistant's - is done."),
        h3("A day only exists in a time zone"),
        p("An instant such as `2026-10-20T23:45:00Z` is one moment for everybody. Which calendar day it falls on depends on where you are: 20 October in London, 21 October in Ho Chi Minh City, still 20 October in New York. A streak, a daily limit, \"lessons completed today\" and a weekly leaderboard all count calendar days, so all of them need a time zone, and it must be the **learner's**, not the server's or the test runner's."),
        callout("warning", "Fixed offsets vs. real time zones",
            "Real learners have IANA time zones such as Asia/Ho_Chi_Minh or America/New_York, and some zones change their offset for daylight saving time, so a day can be 23 or 25 hours long. In production, store the learner's IANA zone and convert with a library or with Intl.DateTimeFormat and its timeZone option. This lesson and its exercise use a fixed offset in minutes (420 for UTC+07:00), which keeps the arithmetic exact and the tests deterministic. Never use the runner's local time zone (getDate, getHours, toDateString): it is whatever the machine happens to be set to."),
        p("With a fixed offset, the learner's local calendar date of an instant is the UTC date of the instant shifted by the offset. Here is that idea in a different feature, the daily activity chart on the profile page:"),
        code("typescript", `
const MINUTE_MS = 60_000;

// "2026-10-20T23:45:00Z" at +420 -> "2026-10-21"
function localDateKey(instantMs: number, offsetMinutes: number): string {
  return new Date(instantMs + offsetMinutes * MINUTE_MS).toISOString().slice(0, 10);
}

// lessons per local day, for the activity chart
export function activityByDay(completedAt: string[], offsetMinutes: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ts of completedAt) {
    const ms = Date.parse(ts);
    if (Number.isNaN(ms)) continue;                  // a malformed row must not become "NaN-aN-aN"
    const key = localDateKey(ms, offsetMinutes);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}`, "src/lib/activity.ts"),
        p("The shifted `Date` is not \"the time in Vietnam\" - it is a trick to read the local calendar fields with UTC methods. Keep it inside one helper, name it after what it returns, and never pass the shifted value anywhere else."),

        challenge("chal_quiz_aad_231"),

        h2("4. The edge cases to list before you prompt"),
        p("Most edge cases fall into a short list of families. Go through it for every function that takes a collection or a time, and turn each family that applies into at least one test:"),
        bullets([
            "**Empty and one.** No items, exactly one item. Watch for values that only make sense with data: `Math.max()` of nothing is `-Infinity`, an average of nothing is `NaN`, and a loop that starts with `current = 1` claims a streak of 1 for nobody.",
            "**Duplicates.** Two lessons on one day, the same event delivered twice by a retry, the same timestamp twice.",
            "**Order.** Unsorted input, reversed input, ties. If the code needs sorted data, sort it inside, or make the type say so.",
            "**Boundaries.** One second before and after local midnight; the first and last day of a month and of a year; 29 February; inclusive vs. exclusive ends (`>=` or `>`). For time zones: a positive and a negative offset, a half-hour offset (+05:30), and the extremes (-12:00, +14:00).",
            "**\"Now\".** Before the first event today, exactly at midnight, after the period has ended. Pass `now` in as a parameter so tests can choose it.",
            "**Invalid input.** Empty strings, malformed dates, out-of-range values. Decide: skip, reject or fail - and test that decision.",
            "**Large input.** Thousands of rows instead of five (section 6).",
        ]),
        p("Then put the list into the request, as tests or as rules, and ask for the tests first. A version for the streak counter:"),
        code("text", `
Write computeStreaks(completedAt, offsetMinutes, now) in TypeScript.
A day is the learner's local calendar day at UTC + offsetMinutes.
Write the Vitest tests first, one per case, with expected values from these rules:
- no completions; only malformed timestamps (ignored)
- two lessons on the same local day count once
- input in random order
- 23:59:59 and 00:00:00 local are consecutive days; the same pair in UTC may not be
- offsets +420, -300, +330, -720, +840
- the current streak is kept until the end of today if the last lesson was yesterday
- 29 February 2028 and 31 December inside one streak
- 5000 timestamps in under 100 ms
Do not use the machine's time zone or Intl. Show me the tests before the code.`, "prompt"),
        p("Reading the tests before the code is the cheap part of the review: you can check expected values against the rules in your head, which is much easier than finding a missing case in a loop."),

        h2("5. When to stop prompting and write it yourself"),
        p("Sometimes the loop goes like this: a test fails, you paste the failure, the assistant fixes that case and breaks another, you paste that one, and the first one comes back. Each answer is locally plausible and the whole is not converging. Signs that it is time to stop prompting:"),
        bullets([
            "**The same family of bug comes back** for the third time - here, a day computed in UTC again after you asked for local days.",
            "**Fixes are special cases.** `if (gap === 0) continue`, then `if (gap < 2 && sameDay)`, then a check for midnight: patches on a wrong model instead of a right one.",
            "**You cannot state the rule yourself.** If you could not write the definition of \"current streak\" in one sentence, the assistant is guessing the spec as well as the code.",
        ]),
        p("Then do the part that needs judgement by hand: write the definitions (what a day is, when two days are consecutive, when a streak is current) and the one helper that encodes them - for example, a function that turns an instant into an integer day number, so that \"consecutive\" becomes `previous + 1` and months and leap years disappear. With the core rule written and tested, asking the assistant for the remaining loop is safe again: the tests decide."),

        h2("6. Large input: the edge nobody demos"),
        p("A demo has five rows; a learner who has studied for three years has thousands, and an admin report runs over every learner. Three things break first:"),
        bullets([
            "**Quadratic loops.** `days.includes(d)` or `indexOf` inside a loop over the same array is O(n^2): invisible at 50 rows, slow at 50,000. A `Set` makes each lookup cheap.",
            "**Argument limits.** `Math.max(...values)` passes every element as a function argument. With a few hundred thousand values it can throw `RangeError: Maximum call stack size exceeded` (the limit depends on the engine). Use a loop or `reduce`.",
            "**Default sort order.** `[9, 10, 100].sort()` returns `[10, 100, 9]`, because the default compares as strings. Sorting numbers, including day numbers or timestamps, needs `(a, b) => a - b`.",
        ]),
        p("Test with a generated large input and a time limit, not just with the fixture you wrote by hand. The hidden tests of the exercise do exactly that."),

        h2("7. Exercise: learning streaks that survive time zones"),
        p("Write `computeStreaks(completedAt, offsetMinutes, now)` for the profile page. You may use an AI assistant - give it the rules and the edge cases above - and the hidden tests decide. They cover every family in section 4, including offsets on both sides of UTC, input in random order with duplicates, \"not yet today\", 29 February 2028 and a history of a few thousand completions."),
        challenge("chal_coding_aad_232"),

        h2("8. How to verify"),
        bullets([
            "**Table-driven tests per edge family**, with literal expected values worked out from the rules (lesson 2.2), not from the code.",
            "**Invariants that must hold for any input.** Shuffling the timestamps does not change the result. Repeating every timestamp twice does not change it. `current` is never greater than `longest`. Adding a completion on a new day never lowers `longest`.",
            "**Equivalent inputs.** The same instants written with `Z` or with the learner's offset give the same result. A learner at +07:00 with completions at local 06:30 gives the same streak as a learner at +00:00 whose completions are at 06:30 UTC.",
            "**A fixed clock.** `now` is a parameter, so a test can sit one second before and after midnight. Code that calls `Date.now()` inside cannot be tested at the boundary.",
            "**Production data, safely.** Recompute streaks for a sample of real learners from a read replica or an export and compare with what the profile shows; investigate every difference before you ship.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**Calendar days in UTC or in the server's zone.** Spot it: `toISOString().slice(0, 10)`, `toDateString()`, `getDate()` on a timestamp, with no time zone or offset of the learner anywhere nearby.",
            "**\"Consecutive\" as \"within 24 hours\".** 08:00 on Monday and 22:00 on Tuesday are consecutive days 38 hours apart; 23:00 and 01:00 are two days 2 hours apart. Spot it: subtraction of timestamps compared with `86_400_000`.",
            "**Initial values that claim data.** `let longest = 1`, `Math.max(...[])`. Spot it: run the function on an empty array before reading it.",
            "**Trusting input order.** Spot it: comparisons with `items[i - 1]` and no sort in the same function.",
            "**Testing only with demo data.** Spot it: every fixture is one event per day, sorted, at the same time, in UTC.",
        ]),

        h2("10. Summary"),
        numbered([
            "Generated code fits the examples it sees. List the edge cases yourself - empty, duplicates, order, boundaries and offsets, \"now\", invalid and large input - and give them to the assistant as tests before any code.",
            "A calendar day only exists in a time zone: use the learner's, never the server's or the runner's. With a fixed offset, shift the instant and count whole days; with real zones, use Intl or a library.",
            "When the assistant keeps fixing one case and breaking another, stop prompting: write the definitions and the core helper yourself, and let the tests decide the rest.",
        ]),

        h2("Sources"),
        bullets([
            "MDN Web Docs: Date.parse(), Date.prototype.toISOString() and the date time string format - developer.mozilla.org",
            "MDN Web Docs: Intl.DateTimeFormat (the timeZone option) and Array.prototype.sort() (default sort order)",
            "Claude Code overview (giving an agent tests to run while it works) - docs.anthropic.com/en/docs/claude-code/overview",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Find one function in your project that counts or groups by day, week or month. Write down whose time zone it uses and check it in the code. Then write three tests from section 4 that it does not have yet - a duplicate, a boundary one second either side of local midnight, and an empty input - and see which ones fail. If an assistant wrote the function, give it the failing tests and judge whether its fix changes the model or adds a special case."),
    ],
});
