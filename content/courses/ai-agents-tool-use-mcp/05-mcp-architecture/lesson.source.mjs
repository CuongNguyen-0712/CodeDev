// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-atm-2-2",
    title: "MCP: hosts, clients, servers and the JSON-RPC lifecycle",
    slug: { _type: "slug", current: "mcp-hosts-clients-servers-json-rpc-lifecycle" },
    description:
        "After the Study-Plan tools moved into an MCP server, a learner's plan was saved without the confirmation prompt, because the host auto-approved any tool that did not say readOnlyHint: false. Learn how the Model Context Protocol splits the work between host, client and server, what the JSON-RPC 2.0 messages and the initialize handshake look like, which primitives a server offers and which features a client offers, how tools/list and tools/call work over stdio and Streamable HTTP, and which side is responsible for which security decision.",
    estimatedTime: 30,

    scenario: {
        role: "Backend engineer on the CodeDev AI team, moving the Study-Plan tools behind an MCP server",
        problem:
            "The four Study-Plan tools now live in the codedev-study-plan MCP server, so the Study-Plan Agent and the IDE assistant can share them. On the first day, learner u_2048 reports a two-week plan they never confirmed. The host's log shows create_study_plan was auto-approved with the reason \"readOnlyHint !== false\": the server listed the tool without annotations, and the host's approval rule read a missing hint as read-only.",
    },

    content: [
        h2("1. The incident: a plan saved without asking"),
        p("Until last week, the Study-Plan tools were functions inside the agent's process. The team moved them into an MCP server, `codedev-study-plan`, so that two different applications can use them: the Study-Plan Agent on the website and the AI assistant in the CodeDev IDE. Each application had to decide which tools run without asking the learner. The website's host shipped this rule:"),
        code("typescript", `
// host/approval.ts - shipped with the MCP migration
function needsConfirmation(tool: { name: string; annotations?: { readOnlyHint?: boolean } }): boolean {
    // read-only tools run at once, the rest ask the learner first
    return tool.annotations?.readOnlyHint === false;
}`, "host/approval.ts"),
        p("On the first day, learner `u_2048` writes to support: a two-week plan appeared on their dashboard, and they never confirmed it. The host's log has the whole story:"),
        code("text", `
2026-10-21T10:02:11Z host=study-plan-web client=c1 server=codedev-study-plan transport=stdio initialize ok protocolVersion=2025-06-18
2026-10-21T10:02:11Z client=c1 tools/list -> get_progress, list_recommended_courses, search_lessons, create_study_plan
2026-10-21T10:02:11Z client=c1 create_study_plan annotations=<none>
2026-10-21T10:02:19Z run=run_a410 user=u_2048 step=4 model tool_call create_study_plan {"weeks":2,"minutesPerDay":45,...}
2026-10-21T10:02:19Z run=run_a410 policy auto_approve=true reason="readOnlyHint !== false"
2026-10-21T10:02:20Z run=run_a410 client=c1 tools/call create_study_plan -> isError=false "plan_5530 created"`, "host log"),
        p("Two mistakes stack up here. The server's author did not add annotations to `create_study_plan`. The host's author treated **missing** information as \"safe\". But the deeper problem is that the host let a description supplied by a server decide whether a learner is asked. In MCP, asking the user is the host's job, and the host must make that decision from its own policy."),
        p("To see why, you need the protocol's map: who the host, the client and the server are, what they say to each other, and who is responsible for what."),

        h2("2. Reproduce it from the recorded messages"),
        p("MCP messages are plain JSON, so the `tools/list` result the server sent can be saved as a fixture and fed to the approval rule in a unit test:"),
        code("typescript", `
import { readFileSync } from "node:fs";

const listResult = JSON.parse(readFileSync("fixtures/tools-list.codedev-study-plan.json", "utf8"));
for (const tool of listResult.result.tools) {
    console.log(tool.name, needsConfirmation(tool) ? "ASK" : "auto");
}
// get_progress auto
// list_recommended_courses auto
// search_lessons auto
// create_study_plan auto      <- the write tool runs without the learner`, "reproduce.ts"),
        p("This test is the one to keep: whatever the server lists, `create_study_plan` must print `ASK`. Section 9 shows the fix."),

        h2("3. Three roles: host, client, server"),
        p("The **Model Context Protocol (MCP)** is an open protocol that lets an AI application connect to external tools and data in one standard way. The specification defines three roles:"),
        bullets([
            "**Host**: the AI application the user works with. Here, the Study-Plan Agent's backend on the website (and, separately, the IDE). The host runs the model, owns the conversation, decides which servers to connect to, and asks the user for consent.",
            "**Client**: a connector inside the host. Each client holds **one** connection to **one** server. A host that talks to the Study-Plan server and a calendar server runs two clients, and the servers cannot see each other's messages.",
            "**Server**: a program that offers capabilities, here the four Study-Plan tools. It can run locally as a child process or remotely behind HTTP. A server sees only what its client sends it, never the whole conversation.",
        ]),
        image("mcp-host-client-server", {
            alt: "Diagram of the MCP architecture for CodeDev. On the left, a large box is the host, the Study-Plan Agent backend, containing the model, the approval policy and two MCP clients, c1 and c2. Client c1 connects over stdio to the codedev-study-plan server, which offers the tools get_progress, list_recommended_courses, search_lessons and create_study_plan. Client c2 connects over Streamable HTTP to a separate calendar server. Each client has exactly one connection. On the right, a message sequence between client c1 and the server: initialize request, initialize result with capabilities, notifications/initialized with no response, tools/list request and result, tools/call request and result with isError false. A note says the host, not the server, decides when to ask the learner.",
            caption: "One client per server connection. The host owns the model, the user and the approval decision.",
        }),
        p("This split is what makes MCP useful and what makes the incident possible. The same server works in many hosts, so the server cannot know whether the user is watching, which tools this host considers dangerous, or what the user agreed to. Only the host knows. The server describes; the host decides."),

        h2("4. JSON-RPC 2.0 in five minutes"),
        p("Every MCP message is a **JSON-RPC 2.0** message, encoded in UTF-8. There are three kinds:"),
        code("json", `
// request: has an id and a method; the receiver must answer it
{ "jsonrpc": "2.0", "id": 7, "method": "tools/list" }

// response: same id; exactly one of result or error
{ "jsonrpc": "2.0", "id": 7, "result": { "tools": [] } }
{ "jsonrpc": "2.0", "id": 8, "error": { "code": -32601, "message": "Method not found" } }

// notification: no id; the receiver must not answer it
{ "jsonrpc": "2.0", "method": "notifications/initialized" }`, "the three message kinds"),
        bullets([
            "The `id` ties a response to its request. It can be a number or a string, and several requests can be in flight at once, so responses may come back in any order. MCP is stricter than plain JSON-RPC here: the id must not be `null`, and a sender must not reuse an id within a session.",
            "A **notification** is fire-and-forget. Because it has no id, there is nothing to answer, not even an error.",
            "Standard error codes come from JSON-RPC: `-32700` parse error, `-32600` invalid request, `-32601` method not found, `-32602` invalid params, `-32603` internal error.",
        ]),
        p("Both sides can send requests. Usually the client asks (`tools/list`, `tools/call`), but a server can also send requests to the client, for example to ask for a model completion (sampling, section 6)."),

        h2("5. The lifecycle: initialize, initialized, then work"),
        p("A connection starts with a handshake. The client sends `initialize` with the protocol version it wants, its capabilities and its `clientInfo`. The server answers with the version it will use, its own capabilities and its `serverInfo`. Then the client sends the `notifications/initialized` notification, and normal operation begins. Here is the real start of a Study-Plan session, followed by the first two tool requests:"),
        code("json", `
--> { "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": { "elicitation": {} },
        "clientInfo": { "name": "codedev-study-plan-web", "version": "1.4.0" } } }

<-- { "jsonrpc": "2.0", "id": 1, "result": {
        "protocolVersion": "2025-06-18",
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": { "name": "codedev-study-plan", "version": "0.9.2" } } }

--> { "jsonrpc": "2.0", "method": "notifications/initialized" }

--> { "jsonrpc": "2.0", "id": 2, "method": "tools/list" }

<-- { "jsonrpc": "2.0", "id": 2, "result": { "tools": [
        { "name": "get_progress",
          "description": "Returns the signed-in learner's User Level, EXP, completed lessons and current course. Takes no arguments.",
          "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
          "annotations": { "readOnlyHint": true } },
        { "name": "search_lessons",
          "description": "Finds CodeDev lessons by topic. Returns at most limit lessons with id, title, course and minutes.",
          "inputSchema": { "type": "object",
            "properties": { "query": { "type": "string", "maxLength": 80 },
                            "limit": { "type": "integer", "minimum": 1, "maximum": 10 } },
            "required": ["query"], "additionalProperties": false },
          "annotations": { "readOnlyHint": true } },
        { "name": "create_study_plan",
          "description": "Saves a 1- or 2-week plan for the signed-in learner. Only after the learner confirmed it.",
          "inputSchema": { "...": "see lesson 4" },
          "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true } }
      ] } }

--> { "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
        "name": "search_lessons", "arguments": { "query": "SQL joins", "limit": 2 } } }

<-- { "jsonrpc": "2.0", "id": 3, "result": {
        "content": [ { "type": "text", "text": "[{\\"id\\":\\"les_5105\\",\\"title\\":\\"Joins: combining tables\\",\\"course\\":\\"sql-data-modeling\\",\\"minutes\\":25},{\\"id\\":\\"les_5106\\",\\"title\\":\\"GROUP BY progress\\",\\"course\\":\\"sql-data-modeling\\",\\"minutes\\":25}]" } ],
        "isError": false } }`, "client (-->) and server (<--), list shortened to three tools"),
        p("Read what each side promised. The client offered `elicitation` (the server may ask the learner a question through the host) and nothing else: it did not offer sampling, so the server must not ask it for model completions. The server offered `tools` only: no `resources` or `prompts`, so a `resources/list` request would get `-32601`. `listChanged: false` says the server will not send a notification when its tool list changes. Capabilities are a contract for this session: each side uses only what the other declared."),
        p("Version negotiation follows the same pattern. If the server does not support the version the client asked for, it answers with a version it does support, and a client that cannot speak that version disconnects. There is no shutdown message: the client ends the session by closing the transport."),

        h2("6. What servers offer, what clients offer"),
        p("MCP names three **server primitives**. They differ in who decides when they are used:"),
        bullets([
            "**Tools**: functions the model can call, such as `search_lessons`. Model-controlled: the model proposes the call, and the host decides whether it runs.",
            "**Resources**: data identified by a URI that the application can read and put into context, such as a lesson's Markdown. Application-controlled.",
            "**Prompts**: reusable prompt templates the user picks, such as \"Plan my week\". User-controlled.",
        ]),
        p("And three **client features**, which a server may use only if the client declared them:"),
        bullets([
            "**Sampling**: the server asks the host's model for a completion, so the server needs no model key of its own. The host stays in control and can show or refuse the request.",
            "**Roots**: the client tells the server which locations (for example, project folders) it may work in.",
            "**Elicitation**: the server asks the user for information through the host, such as \"How many minutes per day can you study?\".",
        ]),
        p("The Study-Plan server needs only tools. That is a good default: every primitive or feature you add is another path into or out of the system that someone has to secure."),

        h2("7. tools/list and tools/call"),
        p("`tools/list` returns `tools: [{ name, description, inputSchema }]`, plus optional `annotations`. `tools/call` takes `{ name, arguments }` and returns `{ content: [{ type: \"text\", text }], isError }`. There are two different ways for a call to fail, and the difference matters to the model:"),
        bullets([
            "**Tool execution error**: the call reached the tool, and the tool failed (the database timed out, `weeks` was out of range). It comes back as a normal **result** with `isError: true` and a text the model can read and react to.",
            "**Protocol error**: the request itself could not be handled (unknown method, unknown tool name, malformed params). It comes back as a JSON-RPC **error** with a code such as `-32601` or `-32602`.",
        ]),
        code("json", `
<-- { "jsonrpc": "2.0", "id": 9, "result": {
        "content": [ { "type": "text", "text": "Lesson search is unavailable (timeout after 3 s). Try again or plan without search." } ],
        "isError": true } }

<-- { "jsonrpc": "2.0", "id": 10, "error": { "code": -32602, "message": "Unknown tool: search_lesson" } }`, "a tool execution error, then a protocol error"),
        p("Lesson 6 builds a server that makes exactly these decisions."),

        h2("8. Transports: stdio and Streamable HTTP"),
        p("The protocol does not care how bytes travel. The specification defines two standard transports:"),
        bullets([
            "**stdio**: the client starts the server as a child process. Messages go to the server's stdin and come back on its stdout, one JSON-RPC message per line. The server may write logs to stderr, but nothing that is not an MCP message may appear on stdout. The Study-Plan server runs this way next to the agent in development.",
            "**Streamable HTTP**: the server is an independent process with one HTTP endpoint. The client sends each message with an HTTP POST, and the server can answer with a single JSON response or stream several messages back. This is how a remote server, shared by several hosts, is reached; in production the Study-Plan server sits on the internal network this way.",
        ]),
        p("With stdio, the server runs with the permissions of the user or service that started it, and gets credentials from its environment. With HTTP, anyone who can reach the endpoint can try to talk to it, so the server must authenticate clients; the specification defines an authorization framework for HTTP transports based on OAuth 2.1 (see Sources)."),

        h2("9. Who is responsible for what"),
        p("The specification is explicit that MCP itself cannot enforce safety; the implementations must. Split the duties by role:"),
        bullets([
            "**Host**: asks the user for consent before tools run, shows what a tool will do, and keeps a human able to deny a call. It decides from **its own** policy which tools may run without asking.",
            "**Client**: treats everything from a server as untrusted input: descriptions, annotations and results. It applies timeouts and logs calls for audit (lesson 10).",
            "**Server**: validates every input against its schema, enforces access control from the session (lesson 4), rate-limits, and keeps results free of data the caller may not see.",
        ]),
        callout("warning", "Annotations are hints, not permissions",
            "readOnlyHint, destructiveHint, idempotentHint and openWorldHint describe a tool. A server can be wrong, outdated or malicious, so a host must not base a security decision on annotations from a server it does not trust, and missing annotations must never be read as 'safe'. In the specification's defaults, a tool without annotations is not read-only."),
        p("The fix for the incident follows from this table. The host keeps its own policy, keyed by server and tool name, and anything it does not know asks first:"),
        code("typescript", `
// host/approval.ts - after the fix
const AUTO_APPROVE: Record<string, readonly string[]> = {
    "codedev-study-plan": ["get_progress", "list_recommended_courses", "search_lessons"],
};

function needsConfirmation(serverName: string, toolName: string): boolean {
    const allowed = AUTO_APPROVE[serverName] ?? [];
    return !allowed.includes(toolName);   // unknown server, new tool, or a write: ask the learner
}`, "host/approval.ts (fixed)"),
        p("The annotations are still useful: the host can use them to word the prompt (\"This will save a plan\"). They just no longer decide whether the prompt appears. Lesson 7 turns this into a full permission policy."),

        h2("10. Versions are dates"),
        p("The protocol version is a date string, such as `2025-06-18` or `2025-11-25`, the date of the last change that broke compatibility. It is sent in `initialize`, so write the version you tested against into your server's README and tests, and expect hosts to ask for newer ones. The CodeDev V1.3 plan refers to a newer revision, `2026-07-28`, which adds a `server/discover` method; this course does not rely on it (see Sources)."),

        h2("11. Verify"),
        numbered([
            "**Rerun the reproduction.** With the fixed rule, `create_study_plan` must print `ASK`, and so must any tool name the policy has never seen.",
            "**Change the server, not the host.** Make the fixture list `create_study_plan` with `readOnlyHint: true`. The host must still ask: proof that annotations no longer decide.",
            "**Read a raw session.** Run the server over stdio and print every line in both directions: `initialize`, its result, `notifications/initialized` with no reply, then your requests. Check that the capabilities in the result match what the server really implements.",
            "**Probe an undeclared method.** Send `resources/list` to the Study-Plan server. Expect a `-32601` error, not a crash or an empty list.",
        ]),
        p("Now check your understanding on the messages from this lesson:"),
        challenge("chal_quiz_atm_221"),

        h2("12. Pitfalls"),
        bullets([
            "**Trusting server-supplied metadata.** Annotations, descriptions and even tool names come from the server. Detect it: search the host for any `annotations` read that feeds an approval or permission decision.",
            "**Treating missing as safe.** An absent hint, an empty policy entry or an unknown server must default to asking. Detect it with a test that lists a tool with no annotations at all.",
            "**Answering notifications.** A server that sends a response (even an error) to `notifications/initialized` breaks clients that match responses by id. Detect it in a raw stdio transcript: no line may come back after a message without an id.",
            "**Using features that were not negotiated.** A server that sends sampling requests to a client that did not declare `sampling` will fail at runtime. Detect it by logging both capability objects at startup.",
            "**Logging to stdout in a stdio server.** One debug line on stdout corrupts the message stream. Detect it: the client reports a parse error right after a log statement runs.",
        ]),

        h2("13. Summary"),
        bullets([
            "The host owns the model, the user and every approval decision; each client holds one connection to one server; the server describes and enforces its own inputs.",
            "MCP speaks JSON-RPC 2.0: requests with ids, responses with result or error, notifications with no reply; a session starts with initialize, capability negotiation and notifications/initialized.",
            "Tools, resources and prompts are server primitives; sampling, roots and elicitation are client features; tool failures are results with isError, protocol failures are JSON-RPC errors.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Install the official MCP Inspector or any MCP-capable host on your machine, connect it to a small local stdio server (a reference server from the MCP project, or one you write), and record the raw JSON-RPC lines of one session. Mark the initialize request and result, the capabilities each side declared, the initialized notification, and every tools/call. Then write a one-page note for your team: which approvals your host makes, from which policy, and what happens when a server adds a new tool."),

        h2("Sources"),
        bullets([
            "Model Context Protocol specification 2025-06-18: \"Architecture\" (host, client, server; one client per server), \"Base Protocol\" and \"Lifecycle\" (initialize, capability negotiation, notifications/initialized, version negotiation), \"Transports\" (stdio, Streamable HTTP), \"Server Features: Tools\" (tools/list, tools/call, isError, annotations as untrusted hints), \"Security and Trust & Safety\". Exact wording of the consent and human-in-the-loop guidance, annotation defaults, the non-null id rule and the OAuth 2.1 based \"Authorization\" section: to verify per spec version.",
            "Model Context Protocol specification 2025-11-25 (same message shapes for the parts used here, to verify), and 2026-07-28 with `server/discover` as cited in the CodeDev V1.3 plan (to verify; not used in this course).",
            "JSON-RPC 2.0 Specification: Request object, Notification, Response object, Error object (codes -32700 to -32603).",
            "Tested with: TypeScript 5.9, tsc --strict, Node.js 24 in the CodeDev runner; recorded messages replayed as fixtures, no real model or network.",
        ]),
    ],
});
