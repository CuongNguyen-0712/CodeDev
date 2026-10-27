// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aam-2-1",
    title: "MCP: servers, tools, resources & prompts",
    slug: { _type: "slug", current: "mcp-servers-tools-resources-prompts" },
    description:
        "CodeDev had three copies of the same enrollment tool - one in the support console, one in the internal chat bot, one in an IDE plugin - and they drifted until the same question got three different answers. Learn what the Model Context Protocol standardises: hosts, clients and servers; tools, resources and prompts; the JSON-RPC messages of a session (initialize, tools/list, tools/call); the stdio and streamable HTTP transports; capability negotiation; and when MCP is more machinery than you need.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, CodeDev AI platform team",
        problem:
            "A support agent tells a learner that she is not enrolled in \"PostgreSQL Performance Engineering\", while the same question asked in the team's Slack bot says she is. Both answers come from a tool called lookup_enrollment, but there are three copies of it: in the support console agent, in the internal chat bot and in an IDE plugin used by the content team. The console copy was changed two months ago to filter out refunded enrollments; the bot copy still counts them, and the IDE copy still takes an email instead of a user id. Nobody can say which one is right, and a security review asks why three services hold read access to the enrollments table.",
    },

    content: [
        h2("1. The incident: one tool, three copies"),
        p("Ticket SUP-4471 arrives on a Monday: a learner bought \"PostgreSQL Performance Engineering\", asked the support assistant why her lessons were locked, and was told she had no enrollment. The on-call engineer asks the same question in the team's chat bot and gets the opposite answer. Both assistants call a tool named `lookup_enrollment`. A quick search shows why they disagree:"),
        code("bash", `
$ grep -rn "lookup_enrollment" --include=*.ts services/ tools/ plugins/
services/support-console/agent/tools.ts:41:  name: "lookup_enrollment",   // args: { userId, courseId }, hides refunded rows
services/chat-bot/src/tools/enrollment.ts:12:  name: "lookup_enrollment",   // args: { userId, courseId }, counts refunded rows
plugins/ide-assistant/src/enrollment.ts:8:   name: "lookup_enrollment",   // args: { email, courseSlug }

$ git log --oneline -1 -- services/support-console/agent/tools.ts
4be91c2 fix: lookup_enrollment ignores refunded enrollments (SUP-4302)`, "terminal"),
        p("Each host application had glued the same capability to its own agent: its own tool definition, its own SQL, its own database credentials. The fix for SUP-4302 landed in one copy only. Her enrollment was refunded and re-bought, so the console (which hides refunded rows) and the bot (which counts them) read different rows of the same table. The bug is not in a model; it is in how the tools are shared."),
        p("This is the problem the **Model Context Protocol (MCP)** addresses: write the capability once, as a server, and let any host that speaks the protocol use it. Before adopting it, though, you should know exactly what it standardises, what it does not, and when a plain in-process function is still the better choice."),

        h2("2. Read the evidence: what each copy really exposes"),
        p("Before redesigning, list what the model actually sees in each host. A tool, to a model, is only its name, its description and its parameter schema. Print the three definitions side by side:"),
        code("json", `
// support-console
{ "name": "lookup_enrollment", "description": "Active enrollment of a user in a course",
  "parameters": { "type": "object", "properties": { "userId": { "type": "string" }, "courseId": { "type": "string" } },
                  "required": ["userId", "courseId"] } }
// chat-bot
{ "name": "lookup_enrollment", "description": "Check enrollment",
  "parameters": { "type": "object", "properties": { "userId": { "type": "string" }, "courseId": { "type": "string" } } } }
// ide-assistant
{ "name": "lookup_enrollment", "description": "Enrollment by email",
  "parameters": { "type": "object", "properties": { "email": { "type": "string" }, "courseSlug": { "type": "string" } } } }`, "three-definitions.jsonc"),
        bullets([
            "Same name, three contracts. A transcript that says `lookup_enrollment` does not tell you which behaviour ran.",
            "Three sets of credentials to the enrollments table, three places to fix the next bug, three audit trails (or none).",
            "The chat bot's version has no `required` list, so the model may call it with only a course id - and the handler then returns the first matching row of any user.",
        ]),
        p("You can verify the drift without reading code: ask each assistant the same question for the same learner and compare the tool arguments in their transcripts. Different argument shapes for the same tool name are the signature of copied tools."),

        h2("3. The core idea: hosts, clients and servers"),
        p("MCP is an open protocol, built on **JSON-RPC 2.0**, between an AI application and the programs that give it context and actions. It names three roles. Learn them precisely, because most confusion about MCP comes from mixing the first two:"),
        bullets([
            "**Host**: the AI application the person uses - the support console, the chat bot, an IDE. It owns the model, the conversation, the user's identity and the decision of which servers to trust.",
            "**Client**: a connector inside the host that holds **one** connection to **one** server. A host that uses three servers runs three clients. The client speaks the protocol; the host decides what to do with the results.",
            "**Server**: a program that exposes capabilities - here, a `codedev-enrollments` server that owns the SQL and the database credentials, once.",
        ]),
        p("A server offers three kinds of things, and the difference between them is **who decides when they are used**:"),
        bullets([
            "**Tools** are actions or lookups the **model** chooses to call: `lookup_enrollment`, `search_lessons`, `open_ticket`. They are the agent's hands, and they are where Excessive Agency (OWASP LLM06) lives.",
            "**Resources** are read-only context the **application** chooses to attach, addressed by a URI: `codedev://courses/postgres-performance/syllabus`. The host might let the user pick one, or attach it automatically.",
            "**Prompts** are templates the **user** chooses, usually from a menu or a slash command: \"Summarise this learner's progress\" with a `userId` argument, returning ready-made messages.",
        ]),
        p("Clients can offer capabilities to servers too - for example sampling (the server asks the host's model to generate text) and elicitation (the server asks the user a question through the host). You will not need them in this course; just know the protocol is two-way."),
        callout("info", "Which spec this lesson follows",
            "The examples follow the MCP specification as described in this course's plan (version 2026-07-28). MCP changes quickly; check modelcontextprotocol.io for the current specification before you build on any detail, and prefer your SDK's documented API over hand-written messages in production."),

        h3("When not to use MCP"),
        p("MCP adds a process boundary, a protocol, a transport and (over HTTP) an authorization flow. It pays for itself when **the same capability is used by more than one host**, or when you want to plug third-party hosts into your data. It does not when:"),
        bullets([
            "**One application, one agent, in-process tools.** If only the support console uses `lookup_enrollment`, a typed function registered with the agent loop (lesson 1.3) is simpler, faster and easier to test.",
            "**A fixed workflow does the job.** Lesson 1.1 still applies: if the steps are known, call your API directly. MCP is a way to expose tools; it is not a reason to have an agent.",
            "**You need a public API.** MCP servers are built for AI hosts. Human-facing or service-to-service integrations still want a normal, versioned HTTP API, which an MCP server can wrap.",
        ]),

        h2("4. Worked example: one session, message by message"),
        p("Every MCP session starts with a handshake in which both sides agree on a protocol version and say what they support. Here is the support console's client connecting to the new `codedev-enrollments` server. Every message is a JSON-RPC 2.0 object: requests carry an `id` and a `method`, responses carry the same `id` and a `result` or an `error`, notifications have no `id` and get no answer."),
        code("json", `
// client -> server: request
{ "jsonrpc": "2.0", "id": 1, "method": "initialize",
  "params": {
    "protocolVersion": "2026-07-28",
    "capabilities": { "elicitation": {} },
    "clientInfo": { "name": "support-console", "version": "4.12.0" } } }

// server -> client: response with the same id
{ "jsonrpc": "2.0", "id": 1,
  "result": {
    "protocolVersion": "2026-07-28",
    "capabilities": { "tools": { "listChanged": true }, "resources": {} },
    "serverInfo": { "name": "codedev-enrollments", "version": "1.0.0" },
    "instructions": "Read-only access to CodeDev enrollments. Users are identified by id (u_...), never by email." } }

// client -> server: notification, no id, no response
{ "jsonrpc": "2.0", "method": "notifications/initialized" }`, "handshake.jsonc"),
        p("This is **capability negotiation**. The server declared `tools` and `resources`, so the client may list and call tools and read resources. It did not declare `prompts`, so the client must not send `prompts/list`. If the server answers with a different `protocolVersion` than the client asked for, the client either supports that version or disconnects. Neither side should use a feature the other did not declare."),
        p("Next, the client asks which tools exist. This is where the model's view of the server comes from - the host passes these definitions to the model:"),
        code("json", `
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }

{ "jsonrpc": "2.0", "id": 2,
  "result": {
    "tools": [{
      "name": "lookup_enrollment",
      "description": "Returns the learner's current enrollment in one course: status (active, refunded, expired) and enrolled date. Refunded enrollments are returned with status refunded, never hidden.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "courseId": { "type": "string", "description": "Course public id, for example postgres-performance" }
        },
        "required": ["courseId"],
        "additionalProperties": false
      },
      "annotations": { "readOnlyHint": true }
    }] } }`, "tools-list.jsonc"),
        p("Notice what is missing: a `userId` parameter. The learner the console is helping is known to the host, which authenticated the support agent and opened the ticket; the server receives that identity from the connection, not from the model. Lesson 2.2 builds this rule out. Then the model decides to call the tool, and the host forwards the call:"),
        code("json", `
{ "jsonrpc": "2.0", "id": 3, "method": "tools/call",
  "params": { "name": "lookup_enrollment", "arguments": { "courseId": "postgres-performance" } } }

{ "jsonrpc": "2.0", "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "{\\"courseId\\":\\"postgres-performance\\",\\"status\\":\\"active\\",\\"enrolledAt\\":\\"2026-10-19\\"}" }],
    "structuredContent": { "courseId": "postgres-performance", "status": "active", "enrolledAt": "2026-10-19" },
    "isError": false } }`, "tools-call.jsonc"),
        h3("Two kinds of failure"),
        p("MCP separates **protocol errors** from **tool errors**, and the difference matters to the model:"),
        code("json", `
// protocol error: the request itself is wrong (unknown tool, arguments that break the schema)
{ "jsonrpc": "2.0", "id": 4, "error": { "code": -32602, "message": "Unknown tool: lookup_enrolment" } }

// tool error: the call was valid but the tool failed - reported inside a normal result
{ "jsonrpc": "2.0", "id": 5,
  "result": { "content": [{ "type": "text", "text": "Course not found: postgres-perf. Use the course public id, for example postgres-performance." }],
              "isError": true } }`, "errors.jsonc"),
        p("A tool error with `isError: true` is meant to reach the model, which can read the message and try again with a correct id - that is why the text says what a valid id looks like. A JSON-RPC `error` is a contract violation between client and server; hosts typically surface it as a failure rather than as something for the model to fix."),

        h3("Resources and prompts on the wire"),
        p("If the server had declared them, resources and prompts follow the same request/response pattern:"),
        code("json", `
{ "jsonrpc": "2.0", "id": 6, "method": "resources/read",
  "params": { "uri": "codedev://courses/postgres-performance/syllabus" } }
{ "jsonrpc": "2.0", "id": 6,
  "result": { "contents": [{ "uri": "codedev://courses/postgres-performance/syllabus",
                             "mimeType": "text/markdown", "text": "# PostgreSQL Performance Engineering\\n1. Baselines..." }] } }

{ "jsonrpc": "2.0", "id": 7, "method": "prompts/get",
  "params": { "name": "summarise_progress", "arguments": { "courseId": "postgres-performance" } } }
{ "jsonrpc": "2.0", "id": 7,
  "result": { "description": "Summarise the learner's progress in a course",
              "messages": [{ "role": "user", "content": { "type": "text", "text": "Summarise my progress in postgres-performance..." } }] } }`, "resources-prompts.jsonc"),

        challenge("chal_quiz_aam_211"),

        h2("5. Transports: stdio and streamable HTTP"),
        p("The messages above are the same whichever way they travel. MCP defines two standard transports:"),
        bullets([
            "**stdio.** The host starts the server as a child process and writes JSON-RPC messages to its standard input, one per line; the server answers on standard output. Logs go to standard error - a single stray `console.log` on stdout corrupts the stream. Credentials usually come from the environment the host starts the process with. Good for local tools: an IDE plugin running a server on the developer's machine.",
            "**Streamable HTTP.** The server is a remote service with one endpoint, for example `https://api.codedev.test/mcp`. The client sends each message as an HTTP `POST`; the server answers with a JSON body or with a stream of server-sent events when it has several messages to send back. A session id issued at initialization travels in an `Mcp-Session-Id` header. Remote servers authenticate clients with OAuth-based authorization, and must validate the `Origin` header so a web page cannot talk to a local server through the browser.",
        ]),
        code("bash", `
# stdio: the host runs the server and owns its environment
DATABASE_URL=postgres://mcp_reader@db.codedev.test/codedev node dist/enrollments-server.js

# streamable HTTP: one endpoint, one POST per message
curl -s https://api.codedev.test/mcp \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "Mcp-Session-Id: $SESSION_ID" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'`, "terminal"),
        p("For CodeDev, the enrollments server runs as a streamable HTTP service next to the API, so the console, the bot and the IDE plugin all connect to one deployment, with one set of database credentials and one place to fix SUP-4302."),

        h3("What the 2026-07-28 version adds, per the course plan"),
        p("The course plan describes this version as adding a `server/discover` method: a way for a client to learn what a server offers - its identity, supported protocol versions and capabilities - without first running a full `initialize` session. That makes it cheaper to inspect servers in a registry or behind a load balancer. Treat the exact request and response shapes as unverified until you have read them in the specification on modelcontextprotocol.io; if the server or SDK you target does not support it, the `initialize` handshake above still gives you the same information."),

        h2("6. How to verify an MCP server"),
        bullets([
            "**Drive it by hand.** Send `initialize`, `notifications/initialized`, `tools/list` and one `tools/call` yourself (with `curl` for HTTP, or by piping lines into the process for stdio). If you cannot explain every field of the answers, the model cannot either.",
            "**Read the capabilities.** The `initialize` result is the contract: every method the client uses must be covered by a declared capability. A test that calls an undeclared method should get `-32601` (method not found), not a silent success.",
            "**Diff `tools/list` in CI.** Store the expected tool list (names, descriptions, schemas) as a snapshot and fail the build when it changes unreviewed. A description edit changes model behaviour as surely as a code change.",
            "**Test errors both ways.** An unknown tool name must give a protocol error; a valid call for a missing course must give `isError: true` with a message that tells the model what a correct argument looks like.",
            "**Check stdout is clean** for stdio servers: run the server, send `initialize`, and assert every line on stdout parses as JSON-RPC.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Confusing the host with the client.** Authorization decisions (who is the user, which servers are allowed) belong to the host; the client is only a connection. Spot it when a server trusts \"whatever the client says the user is\" without an authenticated token.",
            "**Everything is a tool.** A syllabus the user wants attached is a resource; a reusable request is a prompt. Making them tools hands the decision to the model and grows the tool list it must choose from. Spot it in `tools/list`: tools named `get_*_document` with no arguments.",
            "**Reporting tool failures as JSON-RPC errors.** The model never sees a useful message and cannot correct itself. Spot it in transcripts: the host shows \"tool failed\" and the model guesses again with the same wrong argument.",
            "**Treating `readOnlyHint` as security.** Annotations are hints for the host's UI and approval policy, and a server could lie about them. The server must enforce read-only access itself (lesson 2.2). Spot it when the only thing marking a tool safe is its annotation.",
            "**Logging to stdout in a stdio server.** The client fails to parse the stream and drops the connection. Spot it as intermittent \"parse error\" disconnects that start after a debugging commit.",
        ]),

        h2("8. Summary"),
        numbered([
            "MCP lets one server expose tools (model-chosen), resources (application-chosen) and prompts (user-chosen) to many hosts; each host runs one client per server. Use it when more than one host needs the capability, not for a single in-process agent.",
            "A session is JSON-RPC 2.0: `initialize` negotiates the protocol version and capabilities, `notifications/initialized` completes it, then `tools/list` and `tools/call`. Use only what the other side declared.",
            "Tool failures go in the result with `isError: true` so the model can recover; protocol errors are for broken requests. stdio suits local servers, streamable HTTP suits shared remote ones; check the current spec (including `server/discover`) at modelcontextprotocol.io.",
        ]),

        h2("Sources"),
        bullets([
            "Model Context Protocol specification and concepts (architecture, lifecycle, tools, resources, prompts, transports) - modelcontextprotocol.io",
            "JSON-RPC 2.0 Specification - jsonrpc.org/specification",
            "OWASP Top 10 for LLM Applications 2025: LLM06 Excessive Agency - owasp.org/www-project-top-10-for-large-language-model-applications",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write down, for one assistant you use, which hosts, clients and servers are involved and which of its capabilities are tools, resources or prompts. Then hand-write the five JSON-RPC messages of a session (initialize, its response, initialized, tools/list, one tools/call) for a tool you would expose, and check every field against the current specification."),
    ],
});
