// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-1-2",
    title: "How to give the AI a spec and acceptance tests before any code",
    slug: { _type: "slug", current: "spec-and-acceptance-tests-first" },
    description:
        "\"Add bookmarks to lessons\" took an agent four minutes and shipped duplicates, no limit, the oldest bookmark first and bookmarks for lessons that do not exist, with six green tests that described exactly that. Learn why an agent fills every gap in a prompt with a guess, how to write a short spec of behavior (rules, limits, order, errors, idempotency), how to turn each rule into an acceptance test and watch it fail before any code exists, and how to hand both to the agent so the tests, not the agent's summary, decide when it is done.",
    estimatedTime: 25,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "Two weeks after lesson bookmarks went live on https://app.codedev.test, the dashboard is slow for some learners and support has three kinds of tickets: the same lesson listed several times, the list starting with the oldest bookmark, and bookmarks that open a \"Lesson not found\" page. The database shows one learner with 312 bookmarks and 1,284 rows whose lesson id is the string \"undefined\". The feature was built by a coding agent from the one-line request \"Add bookmarks to lessons\". The product rules - at most 50, no duplicates, newest first, only existing lessons - were in a comment on the ticket, which the agent never saw.",
    },

    content: [
        h2("1. The incident: a feature built from one sentence"),
        p("The request was short because the feature looked small:"),
        code("text", `
> Add bookmarks to lessons. Learners can bookmark a lesson and see their
> bookmarks on the dashboard.`, "the request"),
        p("The agent produced a table, an API route, a dashboard widget and a service with six tests. All six passed. Here is the heart of the service and two of its tests:"),
        code("typescript", `
// lib/bookmarks/service.ts (as merged)
export async function addBookmark(userId: string, lessonId: string) {
  await db.insert(lessonBookmarks).values({ userId, lessonId, createdAt: new Date() });
  return { ok: true };
}

export async function listBookmarks(userId: string) {
  return db.select().from(lessonBookmarks).where(eq(lessonBookmarks.userId, userId));
}

// tests/bookmarks.test.ts (written by the agent, after the code)
it("adds a bookmark", async () => {
  expect(await addBookmark("u1", "l1")).toEqual({ ok: true });
});
it("lists bookmarks", async () => {
  await addBookmark("u1", "l1");
  await addBookmark("u1", "l2");
  expect((await listBookmarks("u1")).map((b) => b.lessonId)).toEqual(["l1", "l2"]);
});`, "what the agent wrote"),
        p("Nothing here is broken code. Every line does what it says. The problem is what is missing: no limit, no duplicate check, no order, no check that the lesson exists, no answer to \"what happens when you remove a bookmark twice\". The agent did not decide to leave those out. **It was never told they exist**, so it filled each gap with the simplest plausible default. And its tests confirm the defaults: the second test asserts insertion order, which is the oldest-first bug the learners reported."),

        h2("2. Read the evidence"),
        p("Each support ticket maps to one missing rule. A few queries against the bookmarks table make that concrete:"),
        code("sql", `
-- duplicates: the same lesson bookmarked more than once by the same learner
SELECT user_id, lesson_id, count(*) AS copies
FROM learning.lesson_bookmarks
GROUP BY user_id, lesson_id
HAVING count(*) > 1
ORDER BY copies DESC
LIMIT 3;

 user_id   | lesson_id | copies
-----------+-----------+--------
 u_8f21c0  | les_214   |     17
 u_03ad9e  | les_101   |      9
 u_8f21c0  | les_209   |      6

-- no limit
SELECT max(n) FROM (SELECT count(*) AS n FROM learning.lesson_bookmarks GROUP BY user_id) t;
 max
-----
 312

-- lessons that do not exist (a client bug sent the string "undefined")
SELECT count(*) FROM learning.lesson_bookmarks b
WHERE NOT EXISTS (SELECT 1 FROM content.lessons l WHERE l.id = b.lesson_id);
 count
-------
  1284`, "psql"),
        p("The duplicates come from double taps on a slow phone: each tap is one insert. The 312 bookmarks make the dashboard query and render slow. The 1,284 broken rows come from a client bug that the API accepted because nothing validated the lesson id. Three tickets, three rules nobody wrote down where the agent could read them."),

        h2("3. Core idea: decide the behavior before anyone writes code"),
        p("A prompt is a spec whether you mean it to be or not. Everything you leave out, the agent decides for you: silently, plausibly, and usually with the simplest option. With a human colleague, gaps turn into questions in the first hour. With an agent, gaps turn into code in the first minute, and the questions arrive later as tickets."),
        p("Two habits close the gaps:"),
        bullets([
            "**A short written spec of behavior.** Not how to build it, but what a user can do, what the rules are, and what each failure returns. Ten to twenty lines. Writing it forces the decisions the agent would otherwise guess: what is the limit, what does a duplicate return, what order, what about invalid input.",
            "**Acceptance tests written from the spec, before any code.** One test per rule, plus one for each pair of rules that can apply to the same input. You watch them fail against a stub. Then they become the contract: the agent's job is to make them pass without changing them, and \"done\" means they pass, not that the agent says so.",
        ]),
        p("This is a division of labor that suits agents well. You do the part that needs product knowledge and judgment: deciding the behavior. The agent does the part it is fast at: writing code until a precise, runnable check passes. Tests that the agent writes after its own code are different: they describe what the code does, so they can only confirm it, as the second test in section 1 shows."),
        h3("What a short spec contains"),
        bullets([
            "**Operations**: what a caller can do, with inputs and outputs.",
            "**Rules**: limits, uniqueness, ordering, which inputs are valid.",
            "**A result for every failure**: not \"handle errors\", but the exact value or status each broken rule produces.",
            "**Precedence**: when two rules apply to the same input, which one wins.",
            "**Idempotency**: what repeating an operation does (a second tap, a retried request).",
            "**Out of scope**: what this version does not do, so the agent does not invent it.",
        ]),
        h3("When not to write a spec first"),
        bullets([
            "**A throwaway spike** to find out what is possible. Label it as such, do not merge it, and write the spec from what you learned.",
            "**Visual design**, where the feedback loop is looking at the screen. Spec the behavior behind the UI, not the pixels.",
            "**A tiny change** whose behavior is already pinned by existing tests. The existing tests are the spec.",
        ]),
        callout("info", "AI can help write the spec, not decide it",
            "Asking an assistant \"what edge cases does this spec miss?\" or \"list questions a careful engineer would ask about this feature\" is a good use of it, and it often finds the double-tap and the invalid-id cases quickly. The answers are decisions for you and the product owner. Write them into the spec; do not let them stay in a chat history."),

        h2("4. Worked example: the bookmark spec"),
        p("Here is the spec the team wrote for the second attempt, saved in the repository as `docs/specs/lesson-bookmarks.md` so the agent can read it and reviewers can link to it:"),
        code("text", `
Lesson bookmarks - spec v2

Operations (in-memory service first; persistence is a later task)
  add(userId, lessonId, at)  -> result
  remove(userId, lessonId)   -> result
  list(userId)               -> lesson ids

Rules for add, checked in this order:
  1. userId and lessonId are non-blank strings, at is a finite number -> "invalid_request"
  2. lessonId exists in the catalog                                   -> "lesson_not_found"
  3. the learner already has this bookmark: nothing changes           -> "already_bookmarked"
  4. the learner already has 50 bookmarks                             -> "limit_reached"
  otherwise the bookmark is saved                                     -> "added"

remove: invalid ids -> "invalid_request"; existed -> "removed";
        otherwise "not_bookmarked" (never an error; removing twice is fine)
list:   newest first by at; equal at: the one added later first
        (at comes from the client and can arrive late from offline sync)

Out of scope: folders, notes on bookmarks, sharing.`, "docs/specs/lesson-bookmarks.md"),
        p("Notice three decisions that the first version guessed wrong. A duplicate is not an error, because the double tap is normal behavior: it returns a distinct result and changes nothing. The order of the checks is part of the spec, because a learner at the limit who taps a lesson they already saved should not be told to delete bookmarks. And time is a parameter, `at`, not `new Date()` inside the service, which keeps the ordering rule testable."),
        h3("Turn every rule into a test name"),
        p("Before writing any test bodies, list them. This is the cheapest review of the spec: if you cannot name a test for a sentence, the sentence is not precise enough."),
        code("typescript", `
// tests/bookmarks.test.ts - written before any implementation exists
import { describe, it, expect } from "vitest";
import { BookmarkService } from "../lib/bookmarks/service";

describe("lesson bookmarks", () => {
  it.todo("add then list returns the lesson");
  it.todo("list is newest first by at");
  it.todo("equal at: the bookmark added later comes first");
  it.todo("a late offline sync is placed by its at, not by its arrival");
  it.todo("adding the same lesson twice keeps one bookmark");
  it.todo("an unknown lesson id is rejected");
  it.todo("blank ids, null and a non-number at are invalid requests");
  it.todo("the 51st bookmark is rejected; other learners are not affected");
  it.todo("at the limit, re-adding a saved lesson is a duplicate, not a limit error");
  it.todo("remove twice: removed, then not_bookmarked");
  it.todo("removing an unknown lesson is not an error");
});`, "acceptance tests, step 1: the list"),
        h3("Write the bodies and watch them fail"),
        p("Then fill in the bodies, starting with the simplest. A few of them:"),
        code("typescript", `
it("add then list returns the lesson", () => {
  const s = new BookmarkService(["les_101", "les_102"]);
  expect(s.add("u_ana", "les_101", 1000)).toBe("added");
  expect(s.list("u_ana")).toEqual(["les_101"]);
});

it("adding the same lesson twice keeps one bookmark", () => {
  const s = new BookmarkService(["les_101"]);
  s.add("u_ana", "les_101", 1000);
  expect(s.add("u_ana", "les_101", 2000)).toBe("already_bookmarked");
  expect(s.list("u_ana")).toEqual(["les_101"]);
});

it("an unknown lesson id is rejected", () => {
  const s = new BookmarkService(["les_101"]);
  expect(s.add("u_ana", "undefined", 1000)).toBe("lesson_not_found");
  expect(s.list("u_ana")).toEqual([]);
});`, "acceptance tests, step 2: bodies"),
        p("Now create a stub that compiles and returns something wrong (`add` always returns \"added\", `list` returns `[]`) and run the file. Every test must fail, and fail on an assertion, not on an import error:"),
        code("bash", `
$ npx vitest run tests/bookmarks.test.ts
 FAIL  tests/bookmarks.test.ts > lesson bookmarks > add then list returns the lesson
AssertionError: expected [] to deeply equal [ 'les_101' ]
 FAIL  tests/bookmarks.test.ts > lesson bookmarks > adding the same lesson twice keeps one bookmark
AssertionError: expected 'added' to be 'already_bookmarked'
 ...
 Tests  11 failed (11)`, "terminal: red before any code"),
        p("A test you have seen fail on a wrong value is a test that can catch a mistake. A test you have only ever seen pass might be passing for the wrong reason: a missing `await`, an assertion that is never reached, an expectation copied from the code's output."),

        challenge("chal_quiz_aad_121"),

        h2("5. Hand it to the agent"),
        p("With the spec and the red tests committed, the request becomes short again, but now every word points at something precise:"),
        code("text", `
Implement lib/bookmarks/service.ts so that tests/bookmarks.test.ts passes.
The behavior is specified in docs/specs/lesson-bookmarks.md - read it first.

Do not modify tests/bookmarks.test.ts or the spec.
If a rule in the spec is unclear or two rules seem to conflict, stop and ask
instead of choosing.
Keep the service in memory and free of I/O; persistence is a separate task.
Run  npx vitest run tests/bookmarks.test.ts  and show the output.`, "the request, second attempt"),
        p("Two sentences in that request do most of the work. \"Do not modify the tests\" makes the tests a contract rather than a suggestion. \"Stop and ask instead of choosing\" turns the agent's guesses back into questions, which is what you wanted in the first place. When the agent does ask, the answer goes into the spec and gets a test, not just a reply in the chat."),
        h3("Reviewing the result"),
        numbered([
            "`git diff --stat`: the service and nothing else. The test file and the spec are unchanged (`git diff -- tests/ docs/specs/` is empty).",
            "Run the tests yourself and read the output. Eleven passed, none skipped.",
            "Break one rule by hand - delete the duplicate check, or swap two checks - and run the tests again. At least one must fail. If none does, your tests have a hole, and that hole is now in the spec too.",
            "Read the code for what the tests cannot see: I/O hidden in the service, `Date.now()` used instead of `at`, the list returned by reference so a caller can change it.",
        ]),

        h2("6. Your turn: implement the spec"),
        p("The exercise gives you the full bookmark spec and a starter with the test runner. Implement it yourself, or with an AI assistant: if you use one, give it the spec, write your own acceptance tests first, and see which rules it gets wrong on the first try. The hidden tests check every rule in the spec, including the places where two rules meet."),
        challenge("chal_coding_aad_122"),

        h2("7. How to verify that the tests are a real contract"),
        bullets([
            "**Traceability.** Every sentence of the spec maps to at least one test name. Put the spec next to the `it(...)` list and tick them off. A sentence with no test is a rule the agent may ignore.",
            "**Red first.** Every acceptance test has been seen failing on an assertion against a stub, before the implementation existed.",
            "**Unchanged by the implementer.** `git diff` on the test file between the commit that added the tests and the agent's last commit is empty.",
            "**Mutations fail.** Deleting a check, flipping a comparison or swapping two checks in the implementation makes at least one test fail (lesson 2.2 covers tests that cannot fail in depth).",
            "**Deterministic.** Time, randomness and I/O are parameters or fakes. The same test run twice gives the same result.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**A spec of the implementation, not the behavior.** \"Store bookmarks in a Map keyed by user\" tells the agent nothing about duplicates or limits. Spot it: the spec names data structures but has no failure results.",
            "**Only happy-path tests.** Spot it: no test name mentions a limit, an invalid input, a repeat or an order. Those are exactly the cases the agent will guess.",
            "**Rules with no precedence.** Two rules can fire on the same input and the spec does not say which wins. Spot it: for each pair of rules, ask \"can one input break both?\". If yes, the spec needs an order and a test for that input.",
            "**Letting the agent edit the tests to pass.** Spot it: `git diff -- tests/` on the agent's branch is not empty. If a test is wrong, fixing it is your decision, made in a separate commit.",
            "**Tests that depend on the clock.** `new Date()` inside the code under test makes ordering tests flaky or impossible. Spot it: the service reads the time itself instead of receiving it.",
        ]),

        h2("9. Summary"),
        bullets([
            "Every gap in a prompt becomes a silent guess in the code: write a short spec of behavior first, with a result for every failure, the precedence of rules and what repeats do.",
            "Turn each rule, and each pair of rules that can meet, into an acceptance test, and watch every test fail against a stub before any implementation exists.",
            "Give the agent the spec and the tests as a contract it may not edit, ask it to stop instead of guessing, and decide \"done\" by running the tests yourself.",
        ]),

        h2("Sources"),
        bullets([
            "Vitest documentation: test.todo, expect and the CLI (vitest run <file>) - vitest.dev",
            "Claude Code documentation, common workflows (including test-driven work with an agent): docs.anthropic.com/en/docs/claude-code/overview",
            "GitHub Copilot documentation: docs.github.com/en/copilot",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take a small feature from your own backlog. Write a spec of at most twenty lines with the six parts from section 3, then a list of it.todo test names, one per rule and one per pair of rules that can meet. Ask an AI assistant which cases your list misses and decide each one. Fill in the tests, watch them fail against a stub, and only then hand the spec and the tests to a coding agent with the request from section 5."),
    ],
});
