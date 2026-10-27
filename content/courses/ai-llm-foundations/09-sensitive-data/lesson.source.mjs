// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-3-3",
    title: "What never goes into a prompt: personal data, secrets & logs",
    slug: { _type: "slug", current: "what-never-goes-into-a-prompt-personal-data-secrets-logs" },
    description:
        "A privacy review finds learners' email addresses, phone numbers and a live session token in the request logs of CodeDev's LLM provider: the ticket-summary feature pasted the whole learner record and the last API requests into every prompt. Learn to treat a prompt as data leaving your system, what never goes into one, what providers may keep (and why you check their data policy instead of assuming), how to minimise and redact before the prompt is built and logged, and when a model that runs locally is the better choice.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev support tooling",
        problem:
            "During the quarterly privacy review, the data protection lead opens the LLM provider's dashboard and finds learners' email addresses, phone numbers and dates of birth in the stored request logs - plus a line with \"Authorization: Bearer\" and a session token. All of it comes from the ticket-summary feature that helps support agents answer faster. You wrote that feature. Find out what it sends, stop sending what it does not need, and show that it stays stopped.",
    },

    content: [
        h2("1. The incident"),
        p("The ticket-summary feature works well: an agent opens a ticket, clicks \"Summarise\", and gets a three-line summary with a suggested reply. Here is how it builds the prompt:"),
        code("typescript", `
// support/summariseTicket.ts (shipped in August)
export async function summariseTicket(ticket: Ticket): Promise<string> {
  const user = await db.users.findById(ticket.userId);
  const recent = await apiLog.lastLines(ticket.userId, 20);
  const prompt = [
    "Summarise this support ticket in three lines and suggest a reply.",
    \`Learner: \${JSON.stringify(user)}\`,
    \`Ticket: \${ticket.body}\`,
    "Last API requests:",
    ...recent,
  ].join("\\n");
  await llmLog.insert({ ticketId: ticket.id, prompt });
  return provider.complete(prompt);
}`, "summariseTicket.ts"),
        p("And this is one prompt as the provider received it, copied from their dashboard by the privacy lead (values shortened):"),
        code("text", `
Summarise this support ticket in three lines and suggest a reply.
Learner: {"id":"u_5521","fullName":"Nguyen Van An","email":"an.nguyen@example.com",
  "phone":"0912 345 678","dateOfBirth":"2004-03-17","plan":"premium","points":1240}
Ticket: I was charged twice for the React course, my card ends in 4417. Please call me.
Last API requests:
2026-10-21T08:01:13Z POST /orders 201 ip=203.0.113.24 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIi...
2026-10-21T08:01:14Z POST /orders 201 ip=203.0.113.24 cookie: cd_session=8f3a0c...`, "Provider dashboard, stored request (retention shown: 30 days)"),
        p("The summary needs to know that a premium learner was charged twice for one course. It does not need the learner's name, email, phone, date of birth, IP address, the last digits of the card, or a bearer token that - if still valid - lets anyone who reads that log act as the learner. All of it was sent on every click, stored by the provider, and stored again in CodeDev's own `llmLog` table."),

        h2("2. A prompt is data leaving your system"),
        p("It is easy to think of a prompt as a function argument. From a data point of view it is an outbound transfer to another company, and it can end up in several places:"),
        bullets([
            "**The provider's systems.** Requests are processed on their servers, possibly in another country, and are often kept for some time - for abuse monitoring, debugging or a dashboard like the one above.",
            "**Possibly training data.** Whether your prompts may be used to train future models depends on the provider, the product (a consumer chat app and a business API often differ) and your settings or contract.",
            "**Your own logs.** Prompt logs are essential for debugging (lessons 3.1 and 3.2 relied on them), which means whatever is in the prompt is also in your database, your log shipper and your backups.",
            "**The model's answer.** Anything in the prompt can be repeated in the output - and the output may be shown to a different person than the one the data belongs to.",
        ]),
        callout("warning", "Check your provider's data policy",
            "Retention periods, training use, opt-out settings, \"zero data retention\" options and processing regions differ between providers, between their consumer and API products, and between plans - and they change. Do not rely on what a blog post or this lesson says: read the current data policy and terms of the exact product you call, check the settings of your organisation's account, and write down what you found in your data inventory with the date."),

        h2("3. What never goes into a prompt"),
        p("Start from the task, not from the data you happen to have. Ask: what does the model need to know to do **this** job? Everything else stays out. Three groups stay out almost always:"),
        bullets([
            "**Personal data the task does not need**: names, email addresses, phone numbers, dates of birth, addresses, ID or passport numbers, IP addresses, payment details (even partial card numbers), and free text where users describe their health, family or finances.",
            "**Secrets**: API keys, access and refresh tokens, session cookies, passwords, database connection strings, private keys. A prompt is never the place to \"just let the model see the config\".",
            "**Whole logs, dumps and records**: `JSON.stringify(user)`, the last 20 request lines, a stack trace with environment variables, a database export. They are convenient and they always contain more than the task needs, usually including the two groups above.",
        ]),
        p("What usually may go in: a pseudonymous id, the learner's plan, the course title, the order status, the ticket text **after** redaction. The rule that makes this hold over time is an **allowlist**: build the prompt context from named fields you chose, never by removing fields from a whole object. A blocklist (`delete user.email`) silently lets through the next field someone adds to the users table."),

        h2("4. Minimise and redact, in that order"),
        p("Minimisation removes what the task does not need; redaction masks what slips into free text, such as an email address a learner typed into the ticket. Both happen **before** the prompt is built, so that neither the provider nor your own log ever sees the original."),
        code("typescript", `
// support/promptContext.ts
const RULES: [RegExp, string][] = [
  [/\\b[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+\\b/g, "[EMAIL]"],
  [/(?:\\+84|\\b0)(?:[\\s.-]?\\d){9}\\b/g, "[PHONE]"],
  [/\\bBearer\\s+[\\w.~+\\/-]+=*/gi, "Bearer [TOKEN]"],
  [/\\b(?:sk|pk|cdk)_(?:live|test)_\\w+/g, "[API_KEY]"],
  [/\\b(?:\\d[ -]?){12,19}\\b/g, "[CARD]"],
];

export function redact(text: string): string {
  return RULES.reduce((out, [pattern, mask]) => out.replace(pattern, mask), text);
}

export function ticketContext(user: User, ticket: Ticket) {
  return {                                   // allowlist: only what the summary needs
    learner: pseudonym(user.id),             // "L-7f3e", stable, not reversible by the provider
    plan: user.plan,
    course: ticket.courseTitle,
    ticket: redact(ticket.body),
  };
}`, "promptContext.ts"),
        code("text", `
redact("Hi, I'm an.nguyen@example.com, call me on 0912 345 678.")
  -> "Hi, I'm [EMAIL], call me on [PHONE]."
redact("curl -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIi' ...")
  -> "curl -H 'Authorization: Bearer [TOKEN]' ..."`, "Unit test output"),
        p("Notice what redaction cannot do: \"Nguyen Van An\" typed into the ticket text is not caught by any pattern, and neither is \"my card ends in 4417\" (four digits are too short to look like a card number). That is why minimisation comes first - the name field is simply not sent - and why redaction rules come with tests and a review of real samples, not with a promise that they catch everything."),
        callout("info", "Redact your own logs too",
            "The `llmLog` table in the incident held the same data as the provider's dashboard. Log the prompt after redaction, never the raw input, and give prompt logs a retention period like any other personal-data store. Lessons 3.1 and 3.2 still work: the debugging value of a prompt log is in its structure and documents, not in the learner's phone number."),

        challenge("chal_quiz_aif_331"),

        h2("5. When the data is sensitive by nature: run the model locally"),
        p("Some tasks cannot be done without sensitive content: classifying tickets that describe a payment dispute, summarising a learner's appeal, searching internal incident reports. When minimisation would remove the very thing the task is about, consider a model that runs on hardware you control, for example an open-weight model served with Ollama on a CodeDev server (lesson 2.3)."),
        bullets([
            "**What you gain**: the text never leaves your infrastructure, there is no third-party retention or training question, and you can process data your contracts do not allow you to share.",
            "**What you pay**: smaller local models are usually less capable than the largest hosted ones, you run and patch the server, and you size the hardware for your peak load (lesson 2.2 on latency still applies).",
            "**What does not change**: your own logs, access control and retention rules. A local model with a prompt log that everyone can read is not private either.",
            "**When not to**: if the task works on minimised, redacted data, a hosted model with a checked data policy is often simpler and better. Local is a tool for data that must not leave, not a default.",
        ]),

        h2("6. How to verify"),
        bullets([
            "**Unit tests for `redact`** with realistic samples from your own tickets (anonymised): emails, Vietnamese and international phone formats, tokens, keys - and a test that ordinary text and course titles are left unchanged.",
            "**A test on the built prompt**: build it from a fixture learner with every field filled and assert that the email, phone, date of birth and the word \"Bearer\" followed by a token do not appear in it.",
            "**A scan of the prompt log**: a scheduled query for email and token patterns in `llmLog`; any hit is an incident, not a warning.",
            "**A dated record of the provider's settings**: retention, training use and region of the account you use, checked against the current policy, reviewed when you change provider or plan.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Sending the whole record.** `JSON.stringify(user)` or `{ ...user }` in a prompt. Spot it: search the code for prompts built from whole objects instead of named fields.",
            "**Removing one field and calling it fixed.** Deleting `email` leaves the phone, the date of birth and the token. Spot it: a blocklist in the diff; replace it with an allowlist.",
            "**Logging before redacting.** The provider gets the masked text, your own log keeps the original. Spot it: read the order of calls - redaction must come before both `llmLog.insert` and `provider.complete`.",
            "**Pasting secrets \"just for debugging\".** A config file, an `.env` or a curl command with a token pasted into a chat assistant. Spot it: treat it like a leaked key - rotate the secret, then fix the habit.",
            "**Assuming the provider's data policy.** \"They don't train on API data\" - for which product, plan and setting, as of when? Spot it: ask for the dated record in the data inventory.",
        ]),

        h2("8. Summary"),
        numbered([
            "A prompt is data sent to another company and stored in your own logs: personal data the task does not need, secrets and whole logs or records never go into it.",
            "Build the prompt context from an allowlist of fields, then redact free text before the prompt is built and before it is logged - and test both.",
            "Check your provider's current data policy and settings instead of assuming them, and run a model locally when the task cannot be done without sensitive content.",
        ]),

        h2("Sources"),
        bullets([
            "Your provider's data usage, retention and privacy documentation for the exact product and plan you use (for example the data controls pages linked from platform.openai.com/docs and docs.anthropic.com).",
            "Ollama model library, for models that run on your own hardware - ollama.com/library",
            "Personal data protection law applies to prompts like to any other processing (in Vietnam, the EU and elsewhere): check your duties with your privacy or legal team.",
        ]),
        callout("tip", "Self-practice (not graded): a prompt data inventory",
            "Pick one feature that calls an LLM - yours or an imagined one on CodeDev, such as the hint bot or the ticket summary. List every field and text that ends up in its prompt, and for each one write: why the task needs it, whether it is personal data or a secret, and what happens to it (kept out, pseudonymised, redacted, sent as is). Add the provider's retention and training settings with the date you checked them, and where your own prompt log keeps the data and for how long."),
    ],
});
