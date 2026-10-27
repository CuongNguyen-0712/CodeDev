// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ttd-1-3",
    title: "Assertions that fail for the right reason",
    slug: { _type: "slug", current: "assertions-that-fail-for-the-right-reason" },
    description:
        "For three days no learner could download a certificate, and the certificate tests stayed green because they asserted toBeTruthy() on an error object. Learn to assert exact values, to check behaviour instead of implementation, to give each test one reason to fail and a readable message, to avoid snapshot traps, to test errors with their message, and to await every async assertion.",
    estimatedTime: 20,

    scenario: {
        role: "Developer on the CodeDev learning platform team",
        problem:
            "Bug report CD-1544: since Monday's release, every learner who finishes a course sees \"Certificate unavailable\" instead of the Download button on https://app.codedev.test/certificates. The release renamed a field on the learner record. The certificate service has eleven tests, the pipeline was green, and the failing behaviour was covered by a test named \"issues a certificate when every lesson is complete\".",
    },

    content: [
        h2("1. The incident: a green test for a broken feature"),
        p("Here is the test that was supposed to protect the feature:"),
        code("typescript", `
// certificates.test.ts
it("issues a certificate when every lesson is complete", async () => {
    const learner = makeLearner({ completedLessonIds: [1, 2, 3] });
    const result = await issueCertificate(learner, threeLessonCourse);
    expect(result).toBeTruthy();
});`, "certificates.test.ts"),
        p("And here is what `issueCertificate` returned for that learner after the release:"),
        code("text", `
> await issueCertificate(learner, threeLessonCourse)
{ ok: false, error: 'not_eligible' }

> Boolean({ ok: false, error: 'not_eligible' })
true`, "node"),
        p("The release renamed `completedLessons` to `completedLessonIds` on the learner record, which is read from a raw SQL row typed `any`, so the compiler could not help. The service still read the old name, saw `undefined`, and decided nobody had finished anything. It returned an error object. Every object in JavaScript is truthy, even one that says \"error\". So the assertion was true for the success and true for the failure: **it could not fail**."),

        h2("2. Read the evidence: what the assertion really claimed"),
        p("An assertion is a claim about behaviour. Read each one as a sentence and ask: what result would make this sentence false?"),
        bullets([
            "`expect(result).toBeTruthy()` claims \"result is not `false`, `0`, `\"\"`, `null`, `undefined` or `NaN`\". Every object, every non-empty string and every non-zero number satisfies it. Only a function that returned nothing at all would make it fail.",
            "`expect(result.ok).toBe(true)` claims \"the operation succeeded\". It fails on the error object. Better, but it says nothing about which certificate came back.",
            "`expect(result).toEqual({ ok: true, certificate: { courseId: \"ts-basics\", learnerId: \"u1\" } })` claims the exact result. It fails on the error object, on a certificate for the wrong course, and on a certificate for the wrong learner.",
        ]),
        p("Run the strong version against the broken release and Vitest tells you the story of the bug in its diff:"),
        code("bash", `
$ npx vitest run certificates
 ✗ certificates.test.ts > issues a certificate when every lesson is complete
   AssertionError: expected { ok: false, error: 'not_eligible' } to deeply equal { ok: true, ... }

   - Expected
   + Received

     {
   -   "certificate": { "courseId": "ts-basics", "learnerId": "u1" },
   -   "ok": true,
   +   "error": "not_eligible",
   +   "ok": false,
     }`, "terminal"),

        h2("3. What makes an assertion fail for the right reason"),
        p("A good assertion fails **when the behaviour is wrong**, and **only** then. The first half catches bugs; the second half keeps the test from crying wolf after every refactor. Six habits get you there."),
        h3("Assert exact values"),
        p("Prefer `toBe` (same primitive value or same reference) and `toEqual` (same structure, recursively) to vague matchers. `toBeTruthy`, `toBeDefined` and `not.toBeNull` belong to the rare cases where any value really is fine. When the result has fields you do not care about, such as a generated id or a timestamp, use `toMatchObject` with the fields you do care about, or `expect.any(String)` for the unpredictable ones:"),
        code("typescript", `
expect(result).toMatchObject({ ok: true, certificate: { courseId: "ts-basics", learnerId: "u1" } });

expect(result).toEqual({
    ok: true,
    certificate: { id: expect.any(String), courseId: "ts-basics", learnerId: "u1", issuedAt: expect.any(String) },
});`, "certificates.test.ts"),
        h3("Assert behaviour, not implementation"),
        p("Behaviour is what a caller can observe: the return value, the error, the row in the database, the email that was sent. Implementation is how the function gets there: which helper it calls, in what order, with which internal variable. A test that spies on internals breaks when you refactor correctly and can still pass when the result is wrong:"),
        code("typescript", `
// fragile: pinned to how the service is written today
const spy = vi.spyOn(eligibility, "countCompleted");
await issueCertificate(learner, threeLessonCourse);
expect(spy).toHaveBeenCalledWith(learner, threeLessonCourse);   // passes during CD-1544

// robust: what the learner actually gets
expect(await issueCertificate(learner, threeLessonCourse)).toMatchObject({ ok: true });`, "certificates.test.ts"),
        p("Checking that a call happened is right when **the call is the behaviour**: sending the certificate email, charging a payment, publishing an event. Lesson 2.2 covers where that boundary lies."),
        h3("One reason to fail per test"),
        p("A test should check one behaviour, and its name should say which. That is not the same as one `expect` per test: several assertions about the same result are fine. The problem is one test that checks eligibility, the email, the PDF title and the audit log. When it fails, the first broken `expect` stops the test, hides the others, and the name (\"certificate works\") does not tell you which rule broke. Split by behaviour:"),
        code("typescript", `
describe("issueCertificate", () => {
    it("issues a certificate when every required lesson is complete", ...);
    it("refuses a learner with one required lesson left", ...);
    it("ignores optional lessons when deciding eligibility", ...);
    it("returns the existing certificate when asked twice", ...);
});`, "certificates.test.ts"),
        h3("Readable failure messages"),
        p("The failure message is the first thing the next person reads, often in a CI log at night. Pick matchers that explain themselves:"),
        code("typescript", `
expect(ids.includes(42)).toBe(true);   // AssertionError: expected false to be true
expect(ids).toContain(42);             // AssertionError: expected [ 7, 12, 40 ] to include 42

// a custom message, as the second argument of expect
expect(result.ok, \`learner \${learner.id} should be eligible for \${course.id}\`).toBe(true);`, "messages.test.ts"),

        h2("4. Snapshots, errors and async: three traps"),
        h3("Snapshots record, they do not judge"),
        p("`toMatchSnapshot()` saves whatever the code returns the first time and fails when it changes later. That is useful for output that is long, stable and hard to describe, such as a generated email body or an error page. It has two traps. A snapshot taken from broken code saves the broken output as \"correct\" - if the first snapshot of `issueCertificate` had been taken during CD-1544, it would contain `not_eligible` forever. And when a large snapshot changes, people press `u` (or run `vitest -u`) to update it without reading the diff. Keep snapshots small, read every snapshot diff in review, and prefer `toMatchInlineSnapshot()` so the expected value sits in the test where reviewers see it. Remove timestamps and random ids before you snapshot, or the test fails on every run."),
        h3("Test errors by their message"),
        p("`toThrow()` with no argument passes for **any** error, including a `TypeError` from a typo in the code under test:"),
        code("typescript", `
// passes when parseCertificateId throws "invalid certificate id" - and also when it crashes
expect(() => parseCertificateId("abc")).toThrow();

// passes only for the error you mean
expect(() => parseCertificateId("abc")).toThrow("invalid certificate id");
expect(() => parseCertificateId("abc")).toThrow(/invalid certificate id/);

// careful: this calls the function BEFORE expect sees it, so the test itself crashes
expect(parseCertificateId("abc")).toThrow("invalid certificate id");`, "errors.test.ts"),
        h3("Await every async assertion"),
        p("For a function that returns a promise, the rejection is the error. Use `.rejects` (or `.resolves`) and put `await` in front of `expect`. Without `await` the test function can finish before the promise settles; recent Vitest versions warn about or fail such an un-awaited assertion, but do not rely on the runner to save you. The worst version is a `try`/`catch` with the assertion only in `catch`: when nothing throws, no assertion runs at all, and a test with zero assertions passes."),
        code("typescript", `
// can never fail: if issueCertificate stops rejecting, the catch block never runs
it("refuses a learner who has not finished", async () => {
    try {
        await issueCertificate(beginner, threeLessonCourse, { strict: true });
    } catch (error) {
        expect((error as Error).message).toBe("not_eligible");
    }
});

// fails for the right reason
it("refuses a learner who has not finished", async () => {
    await expect(issueCertificate(beginner, threeLessonCourse, { strict: true }))
        .rejects.toThrow("not_eligible");
});`, "async.test.ts"),
        callout("tip", "Make zero assertions an error",
            "expect.assertions(1) at the top of a test fails it unless exactly one assertion ran; expect.hasAssertions() fails it unless at least one ran. They are a cheap safety net for callbacks and catch blocks you cannot avoid."),
        challenge("chal_quiz_ttd_131"),

        h2("5. Worked example: the certificate tests, rewritten"),
        p("Putting the habits together. Each test checks one behaviour, with an exact value, through the public function only:"),
        code("typescript", `
import { describe, expect, it } from "vitest";
import { issueCertificate } from "./certificates";

const course = { id: "ts-basics", lessons: [{ id: 1, required: true }, { id: 2, required: true }, { id: 3, required: false }] };
const learner = (completedLessonIds: number[]) => ({ id: "u1", completedLessonIds });

describe("issueCertificate", () => {
    it("issues a certificate when every required lesson is complete", async () => {
        expect(await issueCertificate(learner([1, 2]), course)).toEqual({
            ok: true,
            certificate: { id: expect.any(String), courseId: "ts-basics", learnerId: "u1", issuedAt: expect.any(String) },
        });
    });

    it("refuses a learner with one required lesson left", async () => {
        expect(await issueCertificate(learner([1, 3]), course)).toEqual({ ok: false, error: "not_eligible" });
    });

    it("rejects an unknown course with a clear message", async () => {
        await expect(issueCertificate(learner([1, 2]), undefined as never))
            .rejects.toThrow("unknown course");
    });
});`, "certificates.test.ts"),
        p("Against the CD-1544 release, the first test fails with the diff from section 2, the second still passes (the broken code refuses everybody, so refusing this learner is correct), and the failure message shows the error object the service really returned. That is what \"fail for the right reason\" looks like."),

        h2("6. How to verify an assertion can fail"),
        numbered([
            "**Break the code on purpose.** Make the function return the wrong value - an error object, an empty array, the wrong id - and run the test. It must go red. If it stays green, the assertion is too weak. This is the manual version of mutation testing (lesson 3.4).",
            "**Read the red message without the code open.** Could you tell from the message alone what broke? If it says \"expected false to be true\", change the matcher or add a message.",
            "**Refactor without changing behaviour.** Rename a helper or inline it. A test that goes red now is checking implementation.",
            "**Count the assertions.** In Vitest's verbose output a test that ran no assertion still shows a green check. Use expect.hasAssertions() where control flow could skip them.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**`toBeTruthy` or `toBeDefined` on a result object.** Any object passes, including an error. How to spot it: search the suite for these matchers next to function calls that return objects.",
            "**Spying on internals.** Tests assert which private helper was called. How to spot it: a pure refactor turns tests red while the app behaves the same.",
            "**`toThrow()` without a message or class.** A crash in the code under test counts as a pass. How to spot it: temporarily throw a `TypeError` at the top of the function; the test should fail and does not.",
            "**Assertions that never run.** `expect` only inside `catch`, `.then`, or a loop over a list that turned out empty; or a `.rejects` without `await`. How to spot it: `expect.hasAssertions()` fails the test.",
            "**Snapshots updated on autopilot.** A 400-line snapshot changed in a PR and nobody read it. How to spot it: snapshot files change in commits that do not mention the output change.",
        ]),

        h2("8. Summary"),
        bullets([
            "Assert exact values with toBe, toEqual or toMatchObject; a matcher that any object satisfies cannot catch a returned error.",
            "Check behaviour a caller can see, one behaviour per test, with a failure message that names the bug; check calls only when the call is the behaviour.",
            "Snapshots record rather than judge, toThrow needs the message, and every async assertion needs await - then prove each test can fail by breaking the code once.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest API reference: expect (toBe, toEqual, toMatchObject, toThrow, resolves, rejects, expect.assertions) - vitest.dev/api/expect",
            "Vitest guide: Snapshot - vitest.dev/guide/snapshot",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Search a test suite you work on for toBeTruthy(), toBeDefined() and toThrow() with no argument. For three of them, break the code under test on purpose and check whether the test fails. Rewrite the ones that stay green with exact values or messages."),
    ],
});
