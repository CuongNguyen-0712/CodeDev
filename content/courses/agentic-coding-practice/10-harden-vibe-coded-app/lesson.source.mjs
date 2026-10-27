// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-4-1",
    title: "Harden the vibe-coded app: an admin API without an owner check",
    slug: { _type: "slug", current: "harden-vibe-coded-app-admin-api-owner-check" },
    description:
        "An instructor built the CodeDev course studio with a coding agent in one weekend. It worked in the demo; on Monday another instructor edited a course he does not own, and one request moved the course to him. Work through the incident like the engineer who now owns this code: read the access log, the handler, the agent conversation and its tests, name the bug (missing object-level authorization and writable owner fields), rule out a hijacked session and a role bug, write the policy before the fix, and prove it with a test that has two instructors.",
    estimatedTime: 30,

    scenario: {
        role: "Backend developer who inherited a vibe-coded app, CodeDev learning platform",
        problem:
            "Monday 10:20. Instructor Binh posts in the instructors' channel: \"I opened the course studio, changed the id in the URL and could edit Ana's course. I tried the API with curl to be sure, sorry Ana.\" Ten minutes later Ana reports that her course \"Indexes in Practice\" has disappeared from her dashboard. The course studio was built by the lead instructor, Minh, with a coding agent over the weekend; it passed its tests and went live after Monday's demo. You are asked to find what happened, fix it, and make sure it cannot come back.",
    },

    content: [
        h2("1. The incident: it worked in the demo"),
        p("This is the course scenario, and it starts the way many vibe-coded apps start. Minh needed a small tool for instructors to edit their own courses: title, description, price. On Friday night he opened a coding agent, described the feature in two sentences, accepted every change, watched the tests go green and shipped it after the Monday demo. Nobody else read the code. **Vibe coding** - building by prompting and accepting, judging the result only by whether the app seems to work - is a fine way to try an idea. The trouble starts when the prototype quietly becomes production, with real users and real data, and nobody owns the code it contains."),
        p("The demo exercised one user editing their own course. Production has many instructors, an admin team and people who use curl. Module 4 of this course hardens this app the way you would harden any code you did not write: start from evidence, find the gap between what was asked and what is needed, fix it with a written policy, and leave a test behind that would have failed. This lesson covers the first and most common gap in vibe-coded backends: **authorization on the object, not just on the user**."),

        h2("2. The evidence pack"),
        p("Four pieces of evidence were collected in the first half hour. The quiz refers to them by letter."),
        h3("A. API access log and the courses table"),
        code("text", `
2026-10-19T08:58:02Z POST  /api/auth/login        200 user=u_binh role=instructor sess=s_91c4 ip=198.51.100.7 ua=Firefox/131
2026-10-19T09:02:11Z PATCH /api/courses/c_101     200 user=u_ana  role=instructor sess=s_7f2a ip=203.0.113.24 ua=Chrome/130 keys=title,price
2026-10-19T09:12:40Z PATCH /api/courses/c_101     200 user=u_binh role=instructor sess=s_91c4 ip=198.51.100.7 ua=curl/8.5.0 keys=title
2026-10-19T09:14:03Z PATCH /api/courses/c_102     200 user=u_binh role=instructor sess=s_91c4 ip=198.51.100.7 ua=curl/8.5.0 keys=ownerId,title
2026-10-19T09:30:55Z GET   /api/studio/my-courses 200 user=u_ana  role=instructor sess=s_7f2a ip=203.0.113.24 ua=Chrome/130 count=1

 id    | owner_id | title
 c_101 | u_ana    | Binh was here
 c_102 | u_binh   | Indexes (test)`, "api.codedev.test access log, then SELECT id, owner_id, title FROM courses"),
        h3("B. The handler, as the agent wrote it"),
        code("typescript", `
// app/api/courses/[id]/route.ts
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "unauthenticated" }, 401);
  if (user.role !== "instructor" && user.role !== "admin") {
    return json({ error: "forbidden" }, 403);
  }
  const course = await db.course.findUnique({ where: { id: params.id } });
  if (!course) return json({ error: "not_found" }, 404);
  const body = await req.json();
  const updated = await db.course.update({ where: { id: params.id }, data: body });
  return json(updated, 200);
}`, "route.ts (merged on Monday)"),
        h3("C. The agent conversation"),
        code("text", `
[22:41] Minh: add an edit endpoint for courses in the studio. only instructors can edit. keep it simple, demo is monday
[22:44] agent: Added PATCH /api/courses/:id. It returns 401 without a session and 403 unless the user is an
        instructor or an admin. The body is passed to db.course.update, so new course fields work without
        changing the handler. Added 3 tests in route.test.ts, all passing.
[22:45] Minh: perfect, ship it`, "Friday night, the whole conversation about this endpoint"),
        h3("D. The tests the agent wrote"),
        code("typescript", `
// app/api/courses/[id]/route.test.ts - 3 passed
it("lets an instructor update a course", async () => {
  const ana = await createUser({ role: "instructor" });
  const course = await createCourse({ ownerId: ana.id, title: "Old" });
  expect((await patchCourse(course.id, { title: "New" }, ana)).status).toBe(200);
  expect((await getCourse(course.id)).title).toBe("New");
});
it("rejects anonymous requests", async () => {
  const course = await createCourse({ title: "Old" });
  expect((await patchCourse(course.id, { title: "x" }, null)).status).toBe(401);
});
it("rejects learners", async () => {
  const lan = await createUser({ role: "learner" });
  const course = await createCourse({ title: "Old" });
  expect((await patchCourse(course.id, { title: "x" }, lan)).status).toBe(403);
});`, "route.test.ts"),

        h2("3. Reading the evidence"),
        p("Before anyone proposes a fix, write one line per piece of evidence about what it **shows**:"),
        bullets([
            "**A** shows who did what: the user, role, session, address and client of every request, and the state of the data afterwards. Read the fields, not just the status codes: the `keys=` field says which properties each request tried to write, and `ua=` says which client sent it.",
            "**B** shows which questions the handler asks before it writes: is there a session, and is the role one of two values. Then it writes whatever the body contains.",
            "**C** shows the requirement the agent was given, in full, and the agent's own summary of what it built. Compare the two before you blame either.",
            "**D** shows what the test suite checks: one user per test, the owner on the happy path, then two rejections the role check already handles.",
        ]),
        p("Then answer the questions every authorization incident needs: *who* made the change, *with which credentials*, *through which path*, and *why was it allowed*. The first three come from A. The last one comes from B and C."),

        h2("4. Hypothesis: the API checks the user, not the object"),
        p("Authorization questions come in three sizes, and B answers only the first two:"),
        numbered([
            "**Who are you?** Authentication. `getSessionUser` and the 401.",
            "**What kind of user are you?** Function-level authorization, usually by role. The 403 for learners.",
            "**May you do this to this particular object?** Object-level authorization: is this course yours, or are you an admin? B never asks.",
        ]),
        p("The third question is the one that is easy to forget, because it needs data from the object itself (`course.ownerId`) and because every demo uses the owner. It is common enough that the OWASP API Security Top 10 (2023) ranks it first, as **API1: Broken Object Level Authorization (BOLA)**: an endpoint receives an object id from the client and acts on it without checking that the caller may access that object. Changing the id in a URL is the whole attack."),
        p("B has a second, related gap. `data: body` copies every key of the request body into the row, so the client decides which columns change, including `ownerId`, `id` or a future `published`. OWASP lists this as **API3: Broken Object Property Level Authorization**, which includes what used to be called mass assignment. The agent's summary even advertises it as a feature: \"new course fields work without changing the handler\". A field that works without changing the handler is also a field nobody decided to expose."),
        p("A good hypothesis explains all the evidence. This one does: Binh's own instructor session passed both checks in B (A shows `role=instructor`), the request with `keys=ownerId,title` rewrote the owner (A's table), Ana's dashboard lists courses by owner (count=1), and D never has two instructors in one test, so nothing turned red."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"Ana's session was hijacked.\"** A says otherwise: every write came from `s_91c4`, the session created by Binh's own login, from his address. Revoking all sessions would cost everyone a login and change nothing; Binh, or anyone else with an instructor account, could repeat the request a minute later.",
            "**\"It is a role bug, Binh was treated as an admin.\"** A logs `role=instructor`, and B lets instructors through on purpose. The role check is correct; it is simply the wrong question for this decision. No role mapping can tell you whether *this* course is yours.",
            "**\"The studio UI let him do it.\"** Binh started in the UI, but the writes in A came from `curl/8.5.0`. Whatever the UI hides, the API is reachable by anyone with a session. A UI check is a convenience; the server check is the boundary.",
            "**\"The agent ignored the requirement.\"** C says the opposite: the requirement was \"only instructors can edit\", and the agent built exactly that and described it accurately. The missing sentence - *an instructor can edit only the courses they own* - was never written. Agents fill gaps in a spec with the most likely reading, and the most likely reading of a one-line prompt is the happy path.",
        ]),
        callout("info", "Ownership means owning the spec too",
            "The fix is in the handler, but the cause is upstream: a requirement with no authorization rule, accepted by a person who did not read the diff. In module 1 you wrote specs with acceptance criteria an agent can verify; \"a second instructor gets 404 on my course\" is exactly such a criterion. The person who merges agent-written code owns it, including the questions nobody asked."),

        challenge("chal_quiz_acp_411"),

        h2("5. Write the policy, then the fix"),
        p("Before writing code, write down what the endpoint must answer in each case, and in which order the checks run. The order matters because each answer leaks a little information: a caller who gets 403 \"not your course\" learns that the id exists. Settle these decisions explicitly:"),
        bullets([
            "**401** when there is no valid session. Nothing else is checked.",
            "**403** when the caller's role can never edit courses (a learner). This answer does not depend on the course, so it reveals nothing about it.",
            "**404** when the course does not exist **or** the caller may not see it. Using the same answer for both means an attacker cannot probe which ids exist. Choose 403 for \"not yours\" only when the ids are public anyway (for example, courses already listed in the public catalog) and the clearer error helps your own UI; either way, write the choice down and test it.",
            "**Admins** pass the ownership check, because support needs to fix any course. They still go through the same field rules.",
            "**An allowlist of editable fields.** Name the fields this endpoint may change. Everything else - `id`, `ownerId`, `createdAt`, and any field added to the table later - is rejected with a 400 that names the field, so a client bug or an attack is visible in the logs instead of silently ignored. Moving a course to another instructor is a separate, admin-only operation with its own audit entry.",
        ]),
        p("A blocklist (\"reject `ownerId` and `id`\") looks equivalent and is not: it is correct only until someone adds a column. The allowlist fails closed. The same pattern, on a different resource of the platform, an announcement that instructors post on their course page:"),
        code("typescript", `
// app/api/announcements/[id]/route.ts
const EDITABLE = new Set(["text", "pinned"]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser(req);
  if (!user) return json({ error: "unauthenticated" }, 401);
  if (user.role !== "instructor" && user.role !== "admin") return json({ error: "forbidden" }, 403);

  // Object-level check: scope the lookup to what this user may edit.
  const announcement = await db.announcement.findFirst({
    where: user.role === "admin" ? { id: params.id } : { id: params.id, authorId: user.id },
  });
  if (!announcement) return json({ error: "not_found" }, 404);   // missing or not yours

  const body = await req.json();
  for (const key of Object.keys(body)) {
    if (!EDITABLE.has(key)) return json({ error: "field_not_editable", field: key }, 400);
  }
  const data = { text: body.text, pinned: body.pinned };          // only allowlisted keys reach the database
  return json(await db.announcement.update({ where: { id: announcement.id }, data }), 200);
}`, "object-level check + field allowlist"),
        p("Two details are worth copying. First, the ownership rule is part of the **query**: a non-admin simply cannot load an announcement that is not theirs, so there is no code path that has the row but forgot to check it. Second, the object passed to the database is built from named fields, not from the body, so the allowlist cannot be bypassed by a later refactor that \"simplifies\" the loop. (Value validation - a non-empty text, a boolean `pinned` - goes in the same loop; a schema library such as Zod does both jobs in one declaration.)"),

        h2("6. The challenge: Spot the AI Mistake"),
        p("The challenge gives you the course handler from this incident in plain TypeScript: an in-memory store with Ana's and Binh's courses, sessions already resolved by a fake auth middleware, and a test runner that sends a list of PATCH requests and prints each status and then the whole store. The request sent to the agent is quoted at the top of the file. The agent's handler passes the public tests, exactly like D. The hidden tests do what D never did: a second instructor, `ownerId` in the body, a course that does not exist, and an admin."),
        p("Read the policy in the challenge description carefully: it fixes the order of the checks and the exact error for each case. The store printed after the requests is your evidence that a rejected request really changed nothing."),
        challenge("chal_coding_acp_412"),

        h2("7. How to verify the fix"),
        p("\"Binh tried again and got 404\" is a good sign and not yet verification. Verify the policy, the data and the rest of the codebase:"),
        bullets([
            "**A test with two instructors.** Create Ana and Binh, let Binh PATCH Ana's course, assert 404 and that the course is unchanged. It fails on the agent's handler and passes after the fix. Add one test per decision in the policy: `ownerId` in the body (400, owner unchanged), an admin editing any course (200), an unknown course (404), and an unknown field (400).",
            "**Mutation check.** Delete the owner condition from the fixed handler and run the suite: at least one test must fail. If none does, the tests do not pin the rule (lesson 2.3).",
            "**Search for the same pattern.** The agent wrote one handler this way; it probably wrote others the same way. Search for every route that takes an id from the URL and for every update that receives the request body directly, for example `rg \"params.id\" app/api` and `rg \"data: body\"`. Each hit gets the same two questions: whose object is it, and which fields may change?",
            "**Repair and audit the data.** Restore `c_102` to Ana and `c_101`'s title from the audit trail or a backup, then look for earlier abuse: join the access log (or an audit table) with `courses` and list every successful PATCH whose user is not the owner at that time. If you cannot answer that query, add an audit log of who changed which course fields.",
        ]),
        code("typescript", `
it("does not let a second instructor edit or take over a course", async () => {
  const ana = await createUser({ role: "instructor" });
  const binh = await createUser({ role: "instructor" });
  const course = await createCourse({ ownerId: ana.id, title: "Indexes in Practice" });

  expect((await patchCourse(course.id, { title: "Binh was here" }, binh)).status).toBe(404);
  expect((await patchCourse(course.id, { ownerId: binh.id }, binh)).status).toBe(404);
  expect((await patchCourse(course.id, { ownerId: binh.id }, ana)).status).toBe(400);

  const after = await getCourse(course.id);
  expect(after.ownerId).toBe(ana.id);
  expect(after.title).toBe("Indexes in Practice");
});`, "route.test.ts - the test D was missing"),
        p("Then close the gap that let it ship: add the rule to the instruction file the agent reads (\"every route that takes an object id checks that the caller owns the object or is an admin; every update uses an allowlist of fields; every such route has a test with two users of the same role\"), and add the two-user test to the review checklist."),

        h2("8. Common mistakes when hardening a vibe-coded API"),
        bullets([
            "**Fixing it in the UI.** Hiding the Edit button or filtering the course list leaves the API open. Spot it: replay the request with curl and another user's session; if it returns 200, nothing is fixed.",
            "**Checking ownership against a value the client sends.** `if (body.ownerId !== user.id)` trusts the attacker to describe the object. Spot it: the owner in the check must come from the stored row, never from the request.",
            "**Blocklisting fields.** Rejecting `ownerId` today lets `published` or `price_override` through tomorrow. Spot it: look for a list of forbidden keys instead of allowed ones, or for `...body` / `data: body` anywhere near a database write.",
            "**Testing with one user.** A suite where every test has a single user cannot see object-level bugs. Spot it: grep the test file for a second user of the same role; if there is none, add one.",
            "**Asking the agent to \"make it secure\".** A vague request gets a plausible-looking change, often another role check. Spot it: the prompt names no rule and no test. Ask instead for the policy (who may edit which course, which fields, which status codes) and for the failing two-user test first.",
        ]),

        h2("9. Summary"),
        numbered([
            "Authentication and roles answer \"who are you\" and \"what kind of user are you\"; only an object-level check answers \"may you change this course\". A vibe-coded API that was demoed by the owner usually lacks it (OWASP API1, BOLA), and passing the body to the database adds writable owner fields (API3).",
            "Read the evidence before acting: the user and session fields rule out a hijacked session, the logged role rules out a role bug, and the client field shows the UI is not the boundary. The agent built what it was asked; the missing rule is the owner's to write.",
            "Write the policy first (401, 403, 404 for missing or not yours, admins, an allowlist of fields), put the ownership rule where it cannot be skipped, and prove it with a test that has two instructors.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP API Security Top 10 (2023): API1 Broken Object Level Authorization, API3 Broken Object Property Level Authorization - owasp.org/API-Security",
            "OWASP Authorization Cheat Sheet (deny by default, check permissions on every request and every object) - cheatsheetseries.owasp.org",
            "Anthropic, Claude Code documentation: memory and CLAUDE.md files, for putting review rules where the agent reads them - docs.anthropic.com/en/docs/claude-code/overview",
        ]),
        callout("tip", "Self-practice (not graded): run an agent on a real repo with your harness",
            "Pick a small app of your own that has users and objects they own (a todo list, a notes app, an earlier course project). Set up the harness from this course: a spec with the authorization rule written as acceptance criteria, an instruction file with the review rules from section 7, a command policy, and the test and lint commands as the feedback loop. Then ask an agent to add an edit endpoint and, separately, to find every route that takes an object id. Review the diff as its owner: does each route check the object, use an allowlist, and come with a two-user test? Write down what the harness caught and what you still had to catch yourself."),
    ],
});
