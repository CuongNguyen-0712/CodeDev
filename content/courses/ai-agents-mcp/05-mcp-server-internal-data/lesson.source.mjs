// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-2-2",
    title: "An MCP server for internal data, read-only first",
    slug: { _type: "slug", current: "mcp-server-internal-data-read-only" },
    description:
        "The first prototype of CodeDev's content MCP server had one tool, run_sql, connected as the application's database user. Within a day the tutor agent had shown a learner other learners' emails and solutions, and a 4 MB result had filled its context window. Learn how to design an MCP server for internal data: read-only first, narrow tools such as search_lessons and get_lesson instead of a query language, the user's identity from the authenticated connection and never from the model, per-user authorization, pagination and size limits, and an audit record for every call.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, CodeDev AI platform team",
        problem:
            "To let the tutor agent answer questions about course content, the team shipped a prototype MCP server with a single tool, run_sql(query), connected to PostgreSQL with the application's own role. A learner asked the tutor how other people solved the Two Sum challenge; the model wrote a query joining submissions to users and replied with the code and email addresses of 50 other learners. The same afternoon another session ran SELECT * FROM progress, waited 28 seconds and pushed 4 MB of rows into the conversation. Security asks for the tool to be removed today, and the product team still wants the tutor to search and read lessons.",
    },

    content: [
        h2("1. The incident: a database behind one generic tool"),
        p("The prototype was quick to build and impressive in the demo. Its whole tool list was one entry:"),
        code("json", `
{
  "name": "run_sql",
  "description": "Run a SQL query against the CodeDev database and return the rows as JSON.",
  "inputSchema": {
    "type": "object",
    "properties": { "query": { "type": "string" } },
    "required": ["query"]
  }
}`, "tools-list (prototype).json"),
        p("The server connected as `codedev_app`, the role the web API uses, which can read and write every table. On Thursday a learner asked the tutor: \"How did other people solve Two Sum? I want to compare.\" The server's request log shows what the model did with that freedom:"),
        code("text", `
2026-10-22T14:03:11Z session=s_81f2 user=u_2207 tools/call run_sql
  query: SELECT u.email, s.code, s.passed_at FROM submissions s JOIN users u ON u.id = s.user_id
         WHERE s.challenge_id = 'chal_coding_two_sum' AND s.passed = true LIMIT 50
  rows: 50  bytes: 61,204  duration: 41 ms
2026-10-22T16:47:55Z session=s_9a03 user=u_3318 tools/call run_sql
  query: SELECT * FROM progress
  rows: 412,880  bytes: 4,193,027  duration: 28,412 ms`, "mcp-content.log"),
        p("Nothing here is a model malfunction. The model was asked for other learners' solutions, and the tool let it read them. It was asked about progress, and the tool let it read all of it. The database role, not the learner, decided what was visible, and the role could see everything. This is OWASP LLM06, **Excessive Agency**: the agent had more functionality and more permission than its task needed. The same role could also have run `UPDATE` or `DELETE`; nobody had tried yet."),

        h2("2. Reproduce it and read the evidence"),
        p("Confirm what the server's role can do, from `psql` connected with the server's credentials. The answers tell you the blast radius of any query the model writes:"),
        code("sql", `
SELECT current_user;                                  -- codedev_app
SELECT has_table_privilege('users', 'SELECT'),        -- t
       has_table_privilege('submissions', 'SELECT'),  -- t
       has_table_privilege('enrollments', 'UPDATE');  -- t
SHOW default_transaction_read_only;                   -- off`, "psql"),
        p("Then look at what the tutor actually needed during the last week, from the transcripts: questions about which lesson explains a topic, the text of a lesson the learner is enrolled in, and the learner's own progress. None of those needs a query language. All of them need **the identity of the learner**, which `run_sql` never had - the SQL ran with the same rights for every user."),

        h2("3. The core idea: expose tasks, not a database"),
        p("A tool is a contract between your data and a model that will try anything the contract allows. Design it from the tasks backwards, with four rules:"),
        numbered([
            "**Read-only first.** Ship the reads, watch them in the audit log for a while, and only then consider a write tool - behind the approval policy of lesson 4.1. A read-only server can leak data but cannot destroy it, and its mistakes are easier to clean up.",
            "**Narrow tools for named tasks.** `search_lessons(query)` and `get_lesson(lessonId)` instead of `run_sql(query)`. Each tool has a fixed query you wrote and reviewed, parameters the model fills in, and a result shape you chose. The model can no longer invent a join to `users`.",
            "**Identity from the host, authorization on the server.** The learner is whoever the host authenticated: the support console's signed-in user, or the subject of the OAuth access token on a streamable HTTP request. The server reads it from the connection and checks every row against it. A `userId` argument filled in by the model is just text from the conversation.",
            "**Bounded results, audited calls.** Every result has a size limit you can state in one sentence, long lists are paged, and every call leaves a record of who called which tool with what (lesson 2.3).",
        ]),
        h3("When a generic query tool is acceptable"),
        p("There is a place for `run_sql`: a developer's own local MCP server over stdio, pointed at a disposable copy of the database with no real user data, where the person at the keyboard reviews each query. It is a power tool for an operator, not a feature for learners. Even there, give it a read-only role on a dataset that is safe to leak, and a statement timeout."),
        callout("warning", "Defence in depth, not one wall",
            "Narrow tools are the main control, but keep the database honest too: the server connects as a role that can only SELECT the tables its tools use, with default_transaction_read_only on and a statement_timeout. If a bug in a handler builds the wrong query, the database still refuses to write and still stops a slow scan."),
        code("sql", `
CREATE ROLE mcp_content_reader LOGIN PASSWORD :'pw';
GRANT SELECT ON lessons, courses, enrollments, lesson_progress TO mcp_content_reader;
-- no users, no submissions, no orders: no tool needs them
ALTER ROLE mcp_content_reader SET default_transaction_read_only = on;
ALTER ROLE mcp_content_reader SET statement_timeout = '2s';`, "migration.sql"),

        h2("4. Worked example: the codedev-content server"),
        p("The new server exposes two tools. Read their descriptions as the model will: each says what the tool is for, what it returns, what it will not do, and how to get the next page."),
        code("json", `
{ "tools": [
  { "name": "search_lessons",
    "description": "Search lesson titles and text in courses the current learner can open (enrolled or free preview). Returns up to 20 matches per page: lessonId, courseId, title and a short snippet, never the full text. Pass nextCursor from the previous result to get more.",
    "inputSchema": { "type": "object",
      "properties": {
        "query":  { "type": "string", "minLength": 2, "maxLength": 200 },
        "limit":  { "type": "integer", "minimum": 1, "maximum": 20, "default": 10 },
        "cursor": { "type": "string", "description": "nextCursor from a previous search_lessons result" } },
      "required": ["query"], "additionalProperties": false },
    "annotations": { "readOnlyHint": true } },
  { "name": "get_lesson",
    "description": "Text of one lesson the current learner can open, up to 8000 characters per call. If truncated is true, call again with offset = nextOffset.",
    "inputSchema": { "type": "object",
      "properties": {
        "lessonId": { "type": "string", "description": "lessonId from search_lessons, for example lesson-pgp-2-1" },
        "offset":   { "type": "integer", "minimum": 0, "default": 0 } },
      "required": ["lessonId"], "additionalProperties": false },
    "annotations": { "readOnlyHint": true } }
] }`, "tools-list (codedev-content).json"),
        p("There is no `userId` anywhere. The handlers receive the learner from the connection. The sketch below is hand-written around a small dispatch function rather than a particular SDK, so you can see every decision; with an SDK the same checks go inside its tool handlers:"),
        code("typescript", `
type AuthedUser = { id: string };                     // from the verified access token / host session
type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: unknown; isError?: boolean };

const MAX_LIMIT = 20;
const MAX_LESSON_CHARS = 8000;

const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });
const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

async function callTool(user: AuthedUser, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
        case "search_lessons": {
            const query = typeof args.query === "string" ? args.query.trim() : "";
            if (query.length < 2) return fail("query must be at least 2 characters, for example \\"composite index\\".");
            const limit = Math.min(Math.max(Number(args.limit ?? 10) || 10, 1), MAX_LIMIT);
            const after = typeof args.cursor === "string" ? decodeCursor(args.cursor) : null;
            // visibleTo: only courses this learner is enrolled in or that offer a free preview
            const rows = await db.searchLessons({ query, visibleTo: user.id, after, take: limit + 1 });
            const items = rows.slice(0, limit).map((r) => ({
                lessonId: r.id, courseId: r.courseId, title: r.title, snippet: r.snippet.slice(0, 200),
            }));
            const nextCursor = rows.length > limit ? encodeCursor(rows[limit - 1]) : null;
            return ok({ items, nextCursor });
        }
        case "get_lesson": {
            const lesson = typeof args.lessonId === "string" ? await db.findLesson(args.lessonId) : null;
            // same answer for "does not exist" and "not yours": do not reveal which lessons exist
            if (!lesson || !(await db.canOpenLesson(user.id, lesson))) {
                return fail("Lesson not found or not available to this learner. Use a lessonId returned by search_lessons.");
            }
            const offset = Math.max(Number(args.offset ?? 0) || 0, 0);
            const text = lesson.body.slice(offset, offset + MAX_LESSON_CHARS);
            const end = offset + text.length;
            return ok({ lessonId: lesson.id, title: lesson.title, text,
                        truncated: end < lesson.body.length, nextOffset: end < lesson.body.length ? end : null });
        }
        default:
            throw new JsonRpcError(-32602, \`Unknown tool: \${name}\`);   // protocol error, not a tool result
    }
}`, "codedev-content/tools.ts"),
        bullets([
            "**Authorization lives in the query.** `visibleTo: user.id` and `canOpenLesson` run on the server for every call. A model that guesses a `lessonId` from another course gets the same \"not found\" as for an id that does not exist, so it cannot probe which paid lessons exist.",
            "**Every result has a stated bound.** A search page is at most 20 items of 200-character snippets; a lesson page is at most 8000 characters. The model asks for more explicitly, and each extra page is a separate, audited call.",
            "**The cursor is opaque and keyset-based.** It encodes the position of the last item sent, not an offset, so pages stay correct while lessons are added. Treat a cursor from the model as untrusted input: decode it defensively and reject one that does not parse.",
            "**Errors teach.** Each `isError` message says what a valid argument looks like, so the model can correct itself instead of retrying blindly.",
        ]),
        h3("Where the identity comes from"),
        p("Over streamable HTTP, the host obtains an access token for the server through MCP's OAuth-based authorization, and the server validates it on every request: signature, expiry, and that the token was issued **for this server** (its audience), not for some other API. The token's subject is the learner. Over stdio, the host starts the process for one user and passes credentials through the environment. Either way the identity arrives **beside** the JSON-RPC message, never inside `arguments`. Never forward the learner's token to other services either; if the server calls the CodeDev API, it uses its own credentials and passes the user id explicitly."),
        code("typescript", `
// HTTP entry point: the identity comes from the Authorization header, verified here
app.post("/mcp", async (req, res) => {
    const user = await verifyAccessToken(req.header("authorization"), { audience: "https://api.codedev.test/mcp" });
    if (!user) return res.status(401).set("WWW-Authenticate", 'Bearer resource_metadata="https://api.codedev.test/.well-known/oauth-protected-resource"').end();
    const message = req.body;                        // JSON-RPC request
    if (message.method === "tools/call") {
        const result = await audited(user, message.params.name, message.params.arguments ?? {}, () =>
            callTool(user, message.params.name, message.params.arguments ?? {}));
        return res.json({ jsonrpc: "2.0", id: message.id, result });
    }
    // initialize, tools/list ... handled the same way
});`, "codedev-content/http.ts"),
        p("`audited` is the wrapper you will write in the next lesson: it records the session, the user, the tool, a redacted summary of the arguments, the outcome and the duration of every call, whether it succeeds, fails or is refused."),

        challenge("chal_quiz_aam_221"),

        h2("5. How to verify the server"),
        bullets([
            "**Authorization tests with two users.** Seed learner A enrolled in `postgres-performance` and learner B who is not. Call `get_lesson` for a paid lesson as each: A gets text, B gets the not-found message. Then call it as B with every argument you can think of (another user's id in a field, an id from A's search results): still not found.",
            "**Size tests at the limits.** Ask `search_lessons` for `limit: 5000` and assert 20 items and a `nextCursor`; ask `get_lesson` for a 50,000-character lesson and assert 8000 characters, `truncated: true` and a working `nextOffset`.",
            "**Database privileges.** As the server's role, `INSERT`, `UPDATE` and `SELECT FROM users` must fail with `permission denied`, and `SELECT pg_sleep(5)` must fail with `canceling statement due to statement timeout`.",
            "**A snapshot of `tools/list`.** Review every change to tool names, descriptions and schemas like an API change; a new argument named `userId` or `sql` should never pass review.",
            "**The audit log after a day of traffic.** Count calls per tool and per user, the largest result sizes and the error rate. Results near the bound every time suggest the page size is too small; many `isError` calls with the same argument suggest a misleading description.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**A query language as a tool** (`run_sql`, `graphql`, `search(filter: any)`). The model can express anything the role allows. Spot it in `tools/list`: a tool whose main parameter is code or a filter expression.",
            "**Trusting a user id from the arguments.** A schema can prove it looks like `u_1093`; it cannot prove the caller is u_1093. Spot it by grepping handlers for `args.userId`, `args.email` or `args.accountId` used in a query.",
            "**Read-only by annotation only.** `readOnlyHint: true` on a handler that runs with a role that can write. Spot it by checking the database role's grants, not the tool list.",
            "**Unbounded results.** A `list_*` tool with no limit, or a body returned whole. Spot it in the audit log: result sizes that grow with the data instead of staying under a fixed bound.",
            "**Different errors for \"missing\" and \"forbidden\".** \"You are not enrolled in lesson-pgp-2-1\" confirms that paid lesson exists and lets a curious model map the catalogue. Spot it by comparing the two messages in your authorization tests.",
        ]),

        h2("7. Summary"),
        numbered([
            "Start an internal-data MCP server read-only, with narrow tools for the tasks you saw in transcripts (`search_lessons`, `get_lesson`), never a generic query tool for end users; back it with a database role that can only read what those tools need.",
            "Take the user from the authenticated connection (host session or OAuth access token for this server) and authorize every row on the server; a user id in the arguments is untrusted text from the conversation.",
            "Bound every result (clamped limits, opaque cursors, truncated text with an explicit next page) and audit every call, so you can say exactly what the agent read and for whom.",
        ]),

        h2("Sources"),
        bullets([
            "Model Context Protocol specification: tools, authorization and security best practices - modelcontextprotocol.io (check the current version)",
            "OWASP Top 10 for LLM Applications 2025: LLM06 Excessive Agency, LLM02 Sensitive Information Disclosure - owasp.org/www-project-top-10-for-large-language-model-applications",
            "PostgreSQL documentation: GRANT, default_transaction_read_only, statement_timeout",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one internal dataset your agents use. List the questions they were really asked last month, then design the smallest set of read-only tools that answers them: name, description, input schema, the bound on each result, and the authorization rule for each row. Write the GRANT statements for the role the server would use and check that no tool needs a table you did not grant."),
    ],
});
