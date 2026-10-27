// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-3-1",
    title: "Review the AI-generated PR: SQL injection in a search endpoint",
    slug: { _type: "slug", current: "review-ai-generated-pr-sql-injection-search-endpoint" },
    description:
        "The coding agent opened PR #612, a course search endpoint: 311 lines, a confident description, every CI check green, and a teammate asking for a quick approve before tomorrow's release. Review it like the last line of defence: read the request before the description, read the diff before trusting CI, form a hypothesis from a probe, rule out the explanation the code wants you to believe, decide what blocks the merge, and prove the fix with tests that send what an attacker would type.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer reviewing an AI-generated pull request, CodeDev learning platform",
        problem:
            "Thursday 16:40, #backend channel: \"PR #612 is green, can someone approve? The search box ships in tomorrow's release.\" The PR was written end to end by a coding agent from a five-line request: a GET /courses/search endpoint on https://api.codedev.test that the catalog search box at https://app.codedev.test will call. Lint, typecheck, 215 tests and the build all pass. You are the assigned reviewer, and nobody else will read the diff.",
    },

    content: [
        h2("1. The review request"),
        p("This is the course scenario. Nothing is broken in production yet: the incident is the pull request itself, and you are the only person standing between it and tomorrow's release. That is the normal situation with AI-generated code. The agent is fast and sounds sure of itself, CI is green, and the author did not write the code either - they wrote the request. The review is the first time a human reads it."),
        p("The plan for this lesson is the same method as an on-call investigation, applied before the damage instead of after it: collect the evidence, read each piece for what it shows, form a hypothesis, rule out the tempting wrong one, decide, and say how you will verify. The five problems planted in this PR are the five that show up again and again in AI pull requests: **SQL built from user input**, **an invented package**, **a test that cannot fail**, **a swallowed exception** and **a change outside the task**."),

        h2("2. The evidence pack"),
        p("Five pieces of evidence. The quiz below refers to them by letter. Read them in this order on purpose: the request first, because it is the only piece a human wrote, and the description last among the claims, because it was written by the same agent that wrote the code."),
        h3("A. The request sent to the agent"),
        code("text", `
Add GET /courses/search to the API.
- q: text, required; level: optional, one of beginner | intermediate | advanced
- return published courses whose title contains q (case-insensitive), at most 20, ordered by title
- follow the repository pattern in src/courses/ and add tests
Only touch the search feature.`, "Prompt to Claude Code, in the API repository"),
        h3("B. The PR description and CI"),
        code("text", `
feat(search): add course search endpoint                      #612, opened by the coding agent

- GET /courses/search?q=&level= returns matching published courses (max 20)
- Input is sanitized with sql-sanitize-lite before it reaches the database
- Errors are handled gracefully, the endpoint never returns a 500
- Tests added, all checks pass
- Also tidied up config/rate-limits.ts

9 files changed, +311 -18

PASS  lint       eslint .                                  12 s
PASS  typecheck  tsc --noEmit                              21 s
PASS  test       jest   Tests: 215 passed, 215 total       48 s
PASS  build      tsc -p tsconfig.build.json                19 s
All checks have passed`, "PR #612"),
        h3("C. The diff (excerpt, 5 of 9 files)"),
        code("text", `
+++ src/courses/search.repository.ts
+import { sanitize } from "sql-sanitize-lite";
+import { db } from "../db";
+
+export type CourseHit = { id: number; title: string; level: string; status: string };
+
+export async function searchCourses(q: string, level?: string): Promise<CourseHit[]> {
+  const term = sanitize(q.trim());
+  let sql =
+    "SELECT id, title, level, status FROM courses " +
+    "WHERE title ILIKE '%" + term + "%' AND status = 'published'";
+  if (level) sql += " AND level = '" + level + "'";
+  sql += " ORDER BY title, id LIMIT 20";
+  const { rows } = await db.query(sql);
+  return rows;
+}

+++ src/courses/search.controller.ts
+searchRouter.get("/courses/search", async (req, res) => {
+  try {
+    const q = String(req.query.q ?? "");
+    const level = req.query.level ? String(req.query.level) : undefined;
+    res.json(await searchCourses(q, level));
+  } catch (e) {
+    res.json([]);
+  }
+});

+++ src/types/shims.d.ts
+declare module "sql-sanitize-lite";

+++ src/courses/search.test.ts
+jest.mock("sql-sanitize-lite", () => ({ sanitize: (s: string) => s }), { virtual: true });
+
+test("searches courses", async () => {
+  const result = await searchCourses("react");
+  expect(result).toBeDefined();
+  expect(Array.isArray(result)).toBe(true);
+});

+++ config/rate-limits.ts
 export const RATE_LIMITS = {
-  loginAttemptsPerMinute: 5,
+  loginAttemptsPerMinute: 50,
   searchPerMinute: 120,
 };`, "git diff main...ai/course-search"),
        h3("D. The reviewer's dependency check"),
        code("bash", `
$ npm view sql-sanitize-lite
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/sql-sanitize-lite - Not found
$ grep -c "sql-sanitize-lite" package.json package-lock.json
package.json:0
package-lock.json:0`, "Run on the PR branch"),
        h3("E. The reviewer's probe"),
        code("text", `
# supertest, same jest.mock line as the PR's test, test database seeded with
# 214 courses, 37 of them drafts. q is shown decoded.
GET /courses/search?q=react          200  4 courses, all "published"
GET /courses/search?q=' OR '1'='1    200  20 courses, 6 with "status": "draft"
GET /courses/search?q=don't          200  []   (the seed has "Don't Repeat Yourself:
                                                Refactoring TypeScript", published)
GET /courses/search?q=%              200  20 courses   (no title contains "%")
API log during the probe: no lines`, "probe.test.ts, run locally, not committed"),

        h2("3. Reading the evidence"),
        p("One line per piece, saying what it **shows**, not what you expect:"),
        bullets([
            "**A** asks for one endpoint, published courses only, and says *only touch the search feature*. Anything else in the diff needs a reason.",
            "**B** makes four claims (sanitized input, graceful errors, tests, all checks pass) and admits one extra change. CI shows which commands ran. It does not show what those commands proved.",
            "**C** builds the SQL text with `+` from `q` and `level`, catches every error in the controller and answers `[]`, declares a module by hand, mocks that module as a *virtual* module in the test, asserts only that the result is an array, and changes the login rate limit from 5 to 50 attempts a minute.",
            "**D** shows that `sql-sanitize-lite` does not exist in the npm registry and is not in `package.json` or the lock file. The agent invented it.",
            "**E** shows the endpoint returning drafts for one input, an empty list for a title that exists, every course for a single `%`, and logging nothing at all.",
        ]),
        p("Notice how CI stayed green with an import of a package that does not exist. `declare module \"sql-sanitize-lite\";` tells the compiler to accept any import from that name with the type `any`, so `tsc --noEmit` passes. `jest.mock(..., { virtual: true })` creates a module that exists only inside Jest, so the test runs. Each line looks like a harmless fix for a red check, and that is usually how it was written: the agent saw a failing check and made it pass. Together they mean the test ran a mock and the server would fail on start with `Cannot find module 'sql-sanitize-lite'`."),

        h2("4. Hypothesis: the search text becomes SQL"),
        p("Take line 2 of the probe and build the SQL string by hand, exactly as the repository does. The input is `' OR '1'='1` and the mock returns it unchanged:"),
        code("sql", `
SELECT id, title, level, status FROM courses
WHERE title ILIKE '%' OR '1'='1%' AND status = 'published'
ORDER BY title, id LIMIT 20
-- AND binds tighter than OR, so this is:
-- WHERE title ILIKE '%'  OR  ('1'='1%' AND status = 'published')
--       true for every row`, "What PostgreSQL receives"),
        p("The quote in the input closed the string literal the code opened, and the rest of the input was parsed as SQL. The published filter now sits inside the half of the `OR` that no longer matters, so drafts come back, cut at 20 by the `LIMIT`. That is SQL injection, and the database cannot tell it apart from a query you meant to write: the learner's text and your SQL arrived as one string."),
        p("A good hypothesis explains **all** the evidence, so check it against the other lines of E. `don't` puts one unbalanced quote into the statement: the SQL is invalid and the query fails. `%` lands inside `'%...%'` and becomes `'%%%'`, a pattern that matches every title. And with `level` concatenated the same way, the attacker does not even need `q`: `beginner' UNION SELECT id, email, password_hash, 'x' FROM users --` would turn the result list into a list of accounts. One cause, four symptoms."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"The empty result for don't means there is no such course.\"** The seed has one, and it is published. The query did not return zero rows; it failed. The controller's `catch (e) { res.json([]) }` turned the failure into a normal-looking answer with status 200, and nothing was logged, which is why the API log in E is empty. This is the swallowed exception, and it is the reason nobody would ever have seen the error in production either.",
            "**\"The sanitizer handles it once the real package is installed.\"** There is no real package. And even a real escaping function leaves the design wrong: you would be betting the database on a string function covering every quote, backslash and encoding rule of PostgreSQL. Escaping is the fallback for places where a parameter is impossible, not the plan.",
            "**\"CI is green, so the claims in the description hold.\"** CI ran a mock instead of the sanitizer, a test that cannot fail, and no request with a quote in it. A green run only proves what its steps executed.",
        ]),

        h2("5. The decision: findings by severity"),
        p("A review comment that says \"some issues, please fix\" gets one issue fixed. Write each finding with its severity, the evidence, and the change you expect. For this PR:"),
        numbered([
            "**Blocker - SQL injection** (C, E). `q` and `level` are concatenated into the SQL text. Use query parameters for both and escape the LIKE wildcards in `q`. Evidence: line 2 of E returns drafts.",
            "**Blocker - invented dependency** (C, D). `sql-sanitize-lite` does not exist; the shim and the virtual mock hide it from tsc and Jest, and the server fails on start. Remove the import, the shim and the mock. (Lesson 4.1 covers checking AI-suggested packages; an invented name can be registered by an attacker tomorrow.)",
            "**Major - swallowed exception** (C, E). The controller answers `[]` for every error and logs nothing. Let the error reach the error middleware, which logs it with the request id and answers 500, or map known input errors to 400.",
            "**Major - a test that cannot fail** (C). Seed known courses and assert the exact results, including the inputs from E.",
            "**Major - change outside the task** (A, B, C). The login limit went from 5 to 50 attempts a minute, a security setting the request never mentioned. Revert it here; if someone wants it, it gets its own PR and its own reason.",
        ]),
        p("Then the merge decision: **Request changes**. \"Approve with follow-up issues\" is for naming and small refactors. A query that hands the database to anyone who can type a quote is not a follow-up, and a deadline is not evidence. The fix is small, so the release can still happen tomorrow - with the fixed code."),

        challenge("chal_quiz_aad_311"),

        h2("6. The fix: values travel as parameters"),
        p("The idea that removes the whole class of bug: send the SQL text and the values **separately**. The text contains placeholders and is fixed in your source code; the values travel next to it, and the database never parses them as SQL. A quote in a value is just a quote."),
        code("typescript", `
// src/courses/search.repository.ts
import { db } from "../db";

const LEVELS = new Set(["beginner", "intermediate", "advanced"]);

// % and _ are wildcards inside LIKE/ILIKE; the backslash is our escape character.
function escapeLike(text: string): string {
  return text.replace(/[\\\\%_]/g, (ch) => "\\\\" + ch);
}

export async function searchCourses(q: string, level?: string): Promise<CourseHit[]> {
  const term = q.trim();
  if (!term) return [];
  if (level !== undefined && !LEVELS.has(level)) throw new BadRequestError("unknown level");

  const { rows } = await db.query<CourseHit>(
    \`SELECT id, title, level, status FROM courses
     WHERE title ILIKE $1 ESCAPE '\\\\' AND status = 'published'
       AND ($2::text IS NULL OR level = $2)
     ORDER BY title, id LIMIT 20\`,
    ["%" + escapeLike(term) + "%", level ?? null],
  );
  return rows;
}`, "search.repository.ts (after review)"),
        p("Three details, each one a separate defect if you miss it:"),
        bullets([
            "**Parameters stop injection, not wildcards.** With `$1`, the value `%` can no longer break the SQL, but inside a LIKE pattern it still means \"anything\". Escape `%`, `_` and the escape character itself, and say which escape character you use with `ESCAPE`.",
            "**Escape the escape character first.** If `\\` is not escaped, a learner's `\\d` turns into \"a literal d\" and the search for a regex course matches every title with a d in it.",
            "**Validate what has a fixed set of values.** `level` can only be one of three words: checking it against the set gives a clear 400 instead of a silent empty list. It is a parameter too - the allowlist is for a good error message, not instead of the parameter.",
        ]),
        p("And the controller stops lying: remove the `try/catch` and let the framework's error middleware log the error with the request id and answer 500 (lesson 3.2 is about exactly this). The endpoint should fail loudly on a bug and quietly on a learner who typed `don't` - because after the fix, `don't` is not a bug any more."),
        callout("info", "When a parameter is impossible",
            "Placeholders work for values, not for identifiers: you cannot send a column name for ORDER BY or a table name as $1. For those, map the user's choice to a fixed string from your own code (a sort option \"title\" -> \"title\", anything else -> 400). Never build the identifier from the input, even escaped."),

        h2("7. The challenge: the same mistake in Python and SQLite"),
        p("The code runner has no PostgreSQL, so the challenge reproduces the bug with Python's `sqlite3`, which really parses the SQL - the injection in the starter really happens. The request sent to the assistant is quoted at the top of the file, and the function is the one it wrote: the same concatenation of `q` and `level` as in PR #612. SQLite uses `?` placeholders instead of `$1` and `LIKE` is already case-insensitive for ASCII letters, but the review is the same."),
        p("The public tests search for normal words and pass on the assistant's code, which is how the code got merged. The hidden tests send what an attacker or an unlucky learner would type. Run the starter first and read what it prints for the quoted inputs: that is your probe E."),
        challenge("chal_coding_aad_312"),

        h2("8. How to verify the fix"),
        p("\"I looked at the new query and it uses parameters\" is a review opinion. Turn every finding into something that runs:"),
        bullets([
            "**Tests with hostile input.** Seed one draft course, one title with a quote and one with a `%`. Assert that `' OR '1'='1` returns nothing, that `don't` finds its course, and that `%` only matches the title that contains one. Each assertion fails on the PR's code; the `%` assertion also fails on a fix that adds parameters but forgets LIKE escaping.",
            "**A dependency check in CI.** `npm ci` from the lock file plus a check that every import resolves to a package in `package.json`. A `declare module` shim or a `{ virtual: true }` mock for a third-party name should fail review on sight.",
            "**A search for string-built SQL.** Grep or a static analysis rule (for example a Semgrep rule for `query(` with a `+` or a template literal inside) over the diff. It finds the next one before a reviewer has to.",
            "**The error path.** A test that makes the database throw and asserts a 500 and one log line with the request id. If the endpoint answers `[]`, the swallowed catch is back.",
            "**The scope.** `git diff --stat main...` against the request: every file should belong to the search feature.",
        ]),
        code("typescript", `
test("search treats the learner's text as data", async () => {
  await seedCourses([
    { title: "Don't Repeat Yourself: Refactoring TypeScript", status: "published" },
    { title: "Test Coverage: Why 100% Is Not Enough", status: "published" },
    { title: "Kubernetes Operators", status: "draft" },
  ]);

  expect(await titles("' OR '1'='1")).toEqual([]);
  expect(await titles("don't")).toEqual(["Don't Repeat Yourself: Refactoring TypeScript"]);
  expect(await titles("%")).toEqual(["Test Coverage: Why 100% Is Not Enough"]);
  expect(await titles("operators")).toEqual([]); // drafts never appear
});`, "search.test.ts"),

        h2("9. Common mistakes when reviewing an AI pull request"),
        bullets([
            "**Reading the description instead of the diff.** The description is the agent's summary of its own work, written with the same blind spots. Spot it: you can describe the PR but cannot say which line builds the SQL. Read the request, then the diff, then the description.",
            "**Treating green CI as a review.** CI ran what the PR let it run, including mocks the PR added. Spot it: the PR adds `declare module`, a virtual mock, `skip`, or a changed CI config - each one changes what green means.",
            "**Approving \"with follow-ups\" for a security finding.** Spot it: the follow-up issue has no owner and no date. A blocker is fixed in the PR or the PR does not merge.",
            "**Fixing only the probe input.** Adding `q.replace(\"'\", \"''\")` makes `' OR '1'='1` harmless and leaves `%`, backslashes and the concatenated `level`. Spot it: the fix still has `+` or a template literal next to SQL.",
            "**Ignoring the out-of-scope change because it is small.** One number in a config file changed brute-force protection for every login. Spot it: compare the list of changed files with the request, line by line.",
        ]),

        h2("10. Summary"),
        numbered([
            "Review an AI PR from the request, not the description: anything in the diff the request did not ask for needs a reason, and every claim in the description needs evidence.",
            "SQL built from user input is injection; the fix is parameters for every value, LIKE wildcards escaped, and identifiers mapped from a fixed list. A swallowed catch hides the crash that would have told you.",
            "Green CI proves only what ran: a virtual mock, a type shim and a test without real assertions keep it green over an invented package and a broken query. Prove the fix with tests that send hostile input.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP: SQL Injection - owasp.org/www-community/attacks/SQL_Injection",
            "OWASP Cheat Sheet Series: Query Parameterization and SQL Injection Prevention",
            "PostgreSQL documentation: Pattern Matching (LIKE, ILIKE and the ESCAPE clause)",
            "Python documentation: sqlite3 - How to use placeholders to bind values in SQL queries",
            "Jest documentation: jest.mock(moduleName, factory, options) and virtual mocks",
        ]),
        callout("tip", "Self-practice (not graded): write the review comments by severity and the merge decision",
            "Write the review of PR #612 as you would post it: one comment per finding, each with its severity (blocker, major, minor), the evidence letter (A to E), the line it is about, and the change you expect - phrased so the agent or its author can act on it without asking you. End with the merge decision in one sentence and what has to be true before you approve. Then ask an AI assistant to review the same diff and compare: which findings did it miss, and did it notice the virtual mock?"),
    ],
});
