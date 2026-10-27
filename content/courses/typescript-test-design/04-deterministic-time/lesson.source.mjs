// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-2-1",
    title: "Make time testable: inject the clock",
    slug: { _type: "slug", current: "make-time-testable-inject-the-clock" },
    description:
        "The assignment deadline test passed every afternoon and failed every night between 00:00 and 07:00 Vietnam time, because both the code and the test read the real clock and the test built \"today\" from the UTC date. Learn to treat the current time as an input: pass a clock or a now value into the function, test it at fixed instants (exactly at the deadline, at the end of grace, around midnight and at month and year ends), use Vitest fake timers where injection is not possible, and keep the machine's time zone out of your results.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The nightly CI run of the API at https://api.codedev.test has been red four nights out of five for a week. Every failure is the same test, \"a submission before today's deadline is on time\" in src/assignments/deadline.test.ts, and every failed run started between 00:00 and 07:00 Vietnam time (UTC+7). Whoever looks at it in the morning presses Re-run, the test passes, and the ticket is closed as \"flaky\". Meanwhile a learner in Bengaluru (UTC+5:30) reported that the TypeScript quiz due at 23:59 her time showed \"Submissions closed\" at 22:50, more than an hour before the deadline.",
    },

    content: [
        h2("1. The incident: a test that knows what time it is"),
        p("The run history of the nightly job tells most of the story before you open any code:"),
        code("text", `
run    started (UTC+7)     result
#812   2026-10-27 14:05    passed
#813   2026-10-28 01:30    failed   deadline.test.ts > a submission before today's deadline is on time
#814   2026-10-28 09:12    passed   (re-run)
#815   2026-10-29 01:30    failed   deadline.test.ts > a submission before today's deadline is on time
#816   2026-10-29 16:40    passed
#817   2026-10-30 01:30    failed   deadline.test.ts > a submission before today's deadline is on time

AssertionError: expected 'closed' to be 'on-time'
 > src/assignments/deadline.test.ts:9:52`, "CI run history"),
        p("A test that fails only at certain hours is not random. It depends on an input that nobody wrote down: the time. Here is the function and its test as they were merged:"),
        code("typescript", `
// src/assignments/deadline.ts - the version that shipped
export function submissionStatus(a: Assignment): Status {
    const now = Date.now();                                   // hidden input
    const due = Date.parse(\`\${a.deadline}:00+07:00\`);         // offset hard-coded
    if (now <= due) return "on-time";
    if (now <= due + a.graceMinutes * 60_000) return "late";
    return "closed";
}

// src/assignments/deadline.test.ts
test("a submission before today's deadline is on time", () => {
    const today = new Date().toISOString().slice(0, 10);      // the UTC date
    const assignment = { id: "ts-quiz-3", deadline: \`\${today}T23:59\`, utcOffsetMinutes: 420, graceMinutes: 15 };
    expect(submissionStatus(assignment)).toBe("on-time");
});`, "deadline.ts"),
        p("At 14:05 in Vietnam it is 07:05 UTC on the same date, so \"today at 23:59\" is later today and the test passes. At 01:30 on 28 October in Vietnam it is 18:30 UTC on **27 October**. `toISOString()` always prints UTC, so the test builds a deadline of 27 October 23:59 in UTC+7, which passed 90 minutes ago. The function correctly answers `closed`; the test is wrong. The learner's report is a second symptom of the same design: the function hard-codes `+07:00` and ignores `utcOffsetMinutes`, so a deadline of 23:59 in UTC+5:30 closed at 23:59 Vietnam time plus 15 minutes of grace - 22:44 in Bengaluru. Nobody had a test for it, because a test for \"22:50 in Bengaluru\" is impossible to write while the function only looks at the real clock."),

        h2("2. Reproduce it on your machine"),
        p("You do not have to wait for 01:30. Freeze the clock at the time of a failed run and the test fails every time, which is the first sign that you understand a \"flaky\" test:"),
        code("typescript", `
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
    vi.useRealTimers();
});

test("reproduce run #813", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T01:30:00+07:00"));  // = 2026-10-27T18:30:00Z
    const today = new Date().toISOString().slice(0, 10);
    console.log(today);                                        // 2026-10-27, not 2026-10-28
    // ...the original assertion now fails on every run
});`, "reproduce.test.ts"),
        callout("info", "Version note",
            "In Vitest 3.x, vi.useFakeTimers() replaces the timer functions and Date, and vi.setSystemTime() sets the instant that new Date() and Date.now() return. Which functions are faked by default has changed between major versions (and Jest uses jest.useFakeTimers / jest.setSystemTime with its own defaults), so check the mocking guide of the version you run before you rely on a detail."),
        p("Write down the two instants that matter, in both zones. Most time bugs are a mismatch between these two columns:"),
        code("text", `
instant (UTC)              Vietnam (UTC+7)        what the test computed as "today"
2026-10-28T07:05:00Z       2026-10-28 14:05       2026-10-28  (right)
2026-10-27T18:30:00Z       2026-10-28 01:30       2026-10-27  (yesterday in Vietnam)`, "two clocks"),

        h2("3. The core idea: the current time is an input"),
        p("A function that calls `new Date()`, `Date.now()` or `performance.now()` has an argument you cannot see in its signature. Its result changes every millisecond, so a test can only check what is true **at the moment it runs**. The fix is the same as for any other dependency: make the input visible and let the caller pass it."),
        bullets([
            "**Pass the value**: `submissionStatus(assignment, now: Date)`. The simplest option, ideal for a pure decision like this one.",
            "**Pass a clock**: `submissionStatus(assignment, clock: Clock)` with `type Clock = { now(): Date }`. Useful when an object needs the time several times or later (a service, a scheduler). Production passes `{ now: () => new Date() }`; a test passes a clock fixed at any instant it likes.",
            "**Fake the global clock** with `vi.useFakeTimers()` / `vi.setSystemTime()` when you cannot change the code yet (legacy code, a third-party library), or when the behaviour is about timers (`setTimeout`, `setInterval`, debounce) rather than about \"what time is it\".",
        ]),
        p("Injection wins whenever you can change the code, for three reasons: the dependency is visible in the type, it works the same in every test runner, and nothing has to be restored after the test. A global fake clock is shared state: forget `vi.useRealTimers()` and the next test in the file still lives on 28 October (lesson 2.3 is about exactly that)."),
        h3("When not to bother"),
        bullets([
            "Code whose only job is to read the clock - a logger timestamp, a `createdAt` set by the database - does not need an injected clock. Test the decisions that use the time, not the act of reading it.",
            "Do not thread a clock through ten layers to reach one comparison. Read the clock once at the edge (the request handler), and pass `now` down as a value.",
            "A fixed UTC offset is only correct for zones without daylight saving time. Vietnam (UTC+7) has none, so `utcOffsetMinutes: 420` is right all year; New York is UTC-5 in winter and UTC-4 in summer. For such zones store an IANA zone name (`America/New_York`) and convert with `Intl.DateTimeFormat`, a date library or Temporal where your runtime supports it.",
        ]),
        h3("Keep the machine's time zone out of the result"),
        p("Freezing the clock freezes an **instant**. It does not freeze the time zone of the computer that runs the test. `getDate()`, `getHours()` and `toLocaleString()` without a `timeZone` option all use the local zone of the process, which is `Asia/Ho_Chi_Minh` on a developer laptop in Hanoi and usually UTC on a CI runner. Domain code should compute with UTC instants (`Date.UTC`, `getTime()`, the `getUTC*` methods) and an explicit offset or zone, and turn them into local wall time only for display."),

        h2("4. The fix: a clock parameter and fixed instants"),
        p("The deadline is stored as the learner sees it - a wall time and the learner's offset - and converted to one UTC instant. After that, every comparison is between two numbers of milliseconds:"),
        code("typescript", `
// src/assignments/deadline.ts
export type Clock = { now(): Date };
export const systemClock: Clock = { now: () => new Date() };

/** "2026-10-31T23:59" at UTC+7 -> the instant 2026-10-31T16:59:00.000Z, in milliseconds */
export function deadlineInstant(wallTime: string, utcOffsetMinutes: number): number {
    // parse the fields, read them as UTC with Date.UTC, then move by the learner's offset
}

export function submissionStatus(a: Assignment, clock: Clock): Status {
    const now = clock.now().getTime();                      // the only place that asks for the time
    const due = deadlineInstant(a.deadline, a.utcOffsetMinutes);
    // ...compare now with due and with due + grace
}

// the route handler is the only place that knows about the real clock
app.post("/assignments/:id/submissions", (req, res) => {
    const status = submissionStatus(findAssignment(req.params.id), systemClock);
    // ...
});`, "deadline.ts"),
        p("The exercise below fills in both functions and validates the stored deadline. Now the test chooses the time. Instead of \"today\", it names the instants where the answer changes - the boundaries from lesson 1.2 applied to time:"),
        code("typescript", `
import { describe, expect, test } from "vitest";
import { submissionStatus, type Clock } from "./deadline";

const at = (iso: string): Clock => ({ now: () => new Date(iso) });
const quiz = { id: "ts-quiz-3", deadline: "2026-10-31T23:59", utcOffsetMinutes: 420, graceMinutes: 15 };
const quizIndia = { ...quiz, utcOffsetMinutes: 330 };            // 23:59 in UTC+5:30 = 18:29Z

describe("submissionStatus, deadline 31 Oct 23:59 in UTC+7 (= 16:59Z), 15 min grace", () => {
    test.each([
        ["2026-10-31T16:58:59.999Z", "on-time"],   // 1 ms before the deadline
        ["2026-10-31T16:59:00.000Z", "on-time"],   // exactly at the deadline
        ["2026-10-31T17:14:00.000Z", "late"],      // exactly at the end of grace
        ["2026-10-31T17:14:00.001Z", "closed"],    // 1 ms after it
    ])("at %s -> %s", (instant, expected) => {
        expect(submissionStatus(quiz, at(instant))).toBe(expected);
    });

    test("the bug report: 22:50 in Bengaluru is before a 23:59 deadline in UTC+5:30", () => {
        expect(submissionStatus(quizIndia, at("2026-10-31T22:50:00+05:30"))).toBe("on-time");
    });
});`, "deadline.test.ts"),
        p("Every row runs at the same instant on every machine, at any hour, forever. The last test turns the learner's bug report into a test: it fails against the shipped code, which ignored `utcOffsetMinutes`, and passes after the fix."),

        challenge("chal_quiz_ttd_211"),

        h3("When the code waits: fake timers"),
        p("Some behaviour is about time passing rather than about the current time - for example the reminder email \"your quiz closes in one hour\", scheduled with `setTimeout`. A test that really waits an hour is useless, and one that waits 50 ms with a shortened delay tests a different program. Fake timers let the test move time forward instantly:"),
        code("typescript", `
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
    vi.useRealTimers();                       // never leave fake time behind for the next test
});

test("the reminder goes out one hour before the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    const send = vi.fn();
    scheduleReminder({ dueAt: new Date("2026-10-31T16:59:00Z") }, send);

    vi.advanceTimersByTime(3 * 60 * 60_000 + 58 * 60_000);    // 15:58Z: one minute too early
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);                            // 15:59Z
    expect(send).toHaveBeenCalledTimes(1);
});`, "reminder.test.ts"),
        p("If `scheduleReminder` accepted a scheduler (`{ setTimeout }`) as well, you could test it with a hand-written fake instead; fake timers are the tool for code that calls the global timers directly."),

        h2("5. How to verify the fix"),
        numbered([
            "**Reproduce first.** The test for 22:50 in Bengaluru, or `vi.setSystemTime` at the time of run #813, must fail before the fix and pass after it. A test that passes against the broken code proves nothing.",
            "**Run the suite in two time zones.** `TZ=UTC npx vitest run` and `TZ=Asia/Ho_Chi_Minh npx vitest run` must both pass. Set `TZ` when you start the process (in the npm script or the CI job): changing `process.env.TZ` inside a running test is less predictable across platforms.",
            "**Search for hidden clocks.** `grep -rnE \"new Date\\(\\)|Date\\.now\\(\\)\" src/` should list only edges such as route handlers and `systemClock`. A lint rule keeps it that way: ESLint's `no-restricted-syntax` with the selector `NewExpression[callee.name='Date'][arguments.length=0]` flags every `new Date()` without arguments, and you allow it in the one file that defines the system clock.",
            "**Check the CI history after a week.** No more failures between 00:00 and 07:00 is the evidence that the incident is closed - not one green re-run.",
        ]),
        p("Now rewrite the deadline function yourself, with validation of the stored deadline. The runner calls your function with clocks fixed at the instants that broke production - exactly at the deadline, at the end of the grace period, around midnight in UTC+7 and in UTC, and on the last day of a month and of a year:"),
        challenge("chal_coding_ttd_212"),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**The test computes its expected value from the real clock.** `today`, `new Date()` or `Date.now()` inside a test means the test may check something different at 01:30 than at 14:05. Spot it: a test that fails at some hours and passes on re-run; any `new Date()` without arguments in a test file.",
            "**Fake time that is never restored.** `vi.useFakeTimers()` in one test without `vi.useRealTimers()` in `afterEach` leaves later tests in the same file in frozen time. Spot it: a test that passes alone (`vitest run -t \"name\"`) and fails in the full file.",
            "**Local-time getters in domain code.** `getDate()`, `getHours()`, `setHours(23, 59)` and `toLocaleDateString()` without `timeZone` give different answers on a laptop and on a UTC CI runner. Spot it: the suite passes with `TZ=Asia/Ho_Chi_Minh` and fails with `TZ=UTC`.",
            "**`toISOString().slice(0, 10)` as \"today\".** That is the UTC date, which is yesterday in Vietnam until 07:00. Spot it: search for the pattern; ask \"today for whom?\"",
            "**Sleeping in tests.** `await new Promise((r) => setTimeout(r, 1000))` makes the suite slow and still flaky under load. Spot it: tests whose duration in the Vitest report matches the sleep; replace with an injected clock or `vi.advanceTimersByTime`.",
        ]),

        h2("7. Summary"),
        bullets([
            "The current time is an input. Read the real clock once at the edge and pass a `Clock` or a `now` value into the code that makes decisions.",
            "Test time at named, fixed instants: exactly at the boundary, one millisecond on each side, midnight in each zone you serve, month and year ends. Use fake timers for code that waits, and always restore real timers.",
            "Freezing the instant does not freeze the time zone: compute with UTC instants and an explicit offset or zone, and run the suite with `TZ=UTC` as well as your local zone.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest guide, Mocking: dates and timers (vi.useFakeTimers, vi.setSystemTime, vi.advanceTimersByTime) - vitest.dev/guide/mocking",
            "MDN Web Docs: Date, Date.UTC() and Date.prototype.toISOString()",
            "Martin Fowler, The Practical Test Pyramid - martinfowler.com/articles/practical-test-pyramid.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Search your own project for new Date() and Date.now(). For each hit, decide whether it is an edge (keep it) or a decision (inject the clock), and add one test at an exact boundary instant for the most important decision. Then add a CI job that runs the suite with TZ=UTC and compare it with your local zone."),
    ],
});
