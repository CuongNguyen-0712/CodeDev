// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-lle-2-3",
    title: "Redact personal data before it reaches logs and traces",
    slug: { _type: "slug", current: "redact-personal-data-logs-traces" },
    description:
        "A debug export of the grading assistant's prompts contained learner emails, phone numbers, citizen ID numbers and full names, and it had been shared in a support ticket. Learn where redaction has to happen (in the process, before anything is logged), how to find structured identifiers without destroying course ids and timestamps, how to match learner names from a roster regardless of case and Vietnamese diacritics, why consistent pseudonyms per document keep logs useful, and how to prove the redactor works.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer responsible for the AI features' logging, CodeDev learning platform",
        problem:
            "To debug a grading complaint, a support engineer exported a day of prompt logs from the grading assistant and attached the file to a ticket in the external help desk. A colleague noticed that the file contained the full text of 3,412 prompts and outputs: learner names in the prompt header, emails and phone numbers that learners had typed into appeal messages, two citizen ID numbers from a learner who pasted a scanned form into a code comment, and model outputs that greeted learners by name. The prompt logs had been written in full since the first version of the assistant, and the same text was attached to traces whenever content capture was switched on for debugging.",
    },

    content: [
        h2("1. The incident: a debug export full of people"),
        p("The prompt log was added on the first day of the grading assistant, when it was used by five internal testers, and it never changed. This is one line of the export (names and numbers here are invented):"),
        code("json", `
{"ts":"2026-10-21T14:02:11.204Z","trace":"4bf92f3577b34da6a3ce929d0e0e4736","sub":"sub-202610211402",
 "prompt":"Grade the submission of Nguyễn Văn An (an.nguyen@gmail.com). Appeal: please call me on 0912 345 678, my CCCD is 079203001234 ...",
 "output":"Hi Nguyen Van An, your query is correct for 4 of 5 tests ..."}`, "prompt-log export, one line"),
        p("Nothing in the line is needed to debug a grading mistake. The rubric, the submission's code, the verdict, the prompt version and the trace id are; who the learner is, is not. Once a file like this exists it gets copied: into tickets, chats, laptops and backups that have none of the access controls of the production database."),

        h2("2. Read the evidence: how much is out there?"),
        p("Before fixing the writer, measure the damage. A few `grep` counts over the stored logs show which types of personal data occur and how often:"),
        code("bash", `
# emails, Vietnamese mobile numbers, 12-digit runs, per day of logs
grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+' prompts-2026-10-21.jsonl | wc -l     # 2,977
grep -oE '(\\+84|0)([ .]?[0-9]){9}' prompts-2026-10-21.jsonl | wc -l                             # 412
grep -oE '[0-9]{12}' prompts-2026-10-21.jsonl | wc -l                                          # 3,431 (!)`, "terminal"),
        p("The last number is too high to be citizen IDs. Looking at the matches, almost all of them are the digits inside submission ids such as `sub-202610211402` - a date and time - and inside course ids. A redaction rule that is too loose would wipe out exactly the ids an engineer needs to find the submission again. So the evidence gives two requirements at once: catch the personal data, and leave the platform's identifiers and timestamps alone."),

        h2("3. Core idea: redact at the source, keep the structure"),
        h3("Where: before the data leaves the process"),
        p("Redaction belongs in the code that writes the log line or sets the span attribute, not in the log store afterwards. Once a prompt reaches a log pipeline, it has already been copied to buffers, agents and possibly a third-party service. Redacting later in a collector is a useful second layer (the OpenTelemetry Collector's contrib distribution has a redaction processor, for example), but it cannot be the only one. The production database keeps the original submission under its own access rules; the logs get the redacted copy."),
        h3("What: four kinds of personal data, two kinds of rules"),
        bullets([
            "**Structured identifiers** have a recognisable shape: emails, phone numbers (in Vietnam `+84` or `0` followed by nine digits, often grouped with spaces or dots), and the 12-digit citizen ID number. A pattern finds them.",
            "**Names** have no shape. General-purpose name detection on free text is unreliable, especially for short Vietnamese names. But the platform knows who the learners and reviewers of a course are, so it can look for **those** names: a roster lookup. It will not catch a name it does not know, and that limit should be written down.",
        ]),
        p("A pattern also needs to say what may **not** touch a match. A 12-digit run that follows `sub-` or `course_` is part of an id. Requiring that there is no letter, digit, `_` or `-` right before or after the match keeps those ids intact. Be careful with `\\b`: it is a boundary between word characters (letters, digits, `_`) and anything else, so it treats `-` as a boundary and redacts the digits of `sub-202610211402`."),
        h3("Names: case and diacritics"),
        p("Learners type their own name in many ways: `Nguyễn Văn An`, `NGUYEN VAN AN`, `nguyen van an`. Compare names in a folded form: decompose with `normalize(\"NFD\")`, which splits a letter like `ễ` into `e` plus combining marks, remove the combining marks (U+0300 to U+036F), map `đ` to `d` (it is a separate letter, not a `d` with a mark, so NFD does not split it), and lowercase. A whole-word check on the folded text stops `Lê An` from matching inside `Lê Anh`."),
        code("typescript", `
const fold = (s: string) =>
    s.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

fold("Nguyễn Văn An");      // "nguyen van an"
fold("ĐẶNG THU HÀ");        // "dang thu ha"
fold("Lê Anh").startsWith(fold("Lê An"));   // true - which is why the next character must be checked`, "fold.ts"),
        p("If the text is in NFC (precomposed characters, which is what browsers and most APIs produce), each character folds to exactly one character, so a position in the folded text is the same position in the original. That lets you search the folded text and cut the original. Text in NFD would break this, so normalise the input to NFC first if it can come from elsewhere."),
        h3("How: consistent pseudonyms, counts per type"),
        p("Replacing everything with `[REDACTED]` makes logs safe and useless: you can no longer see that the model repeated the learner's email in its output, or that two appeals came from the same phone. A **pseudonym per value within one document** keeps that structure: the first distinct email becomes `[EMAIL_1]`, the second `[EMAIL_2]`, and every later occurrence of the first email is `[EMAIL_1]` again. The numbering restarts in every document, so the placeholders cannot be joined across traces into a profile."),
        p("Counting the replacements per type gives the redactor its own monitoring. A feature whose `EMAIL` count jumps from near zero to hundreds a day has started to put new data into prompts; a count that drops to zero on every feature after a deploy usually means the redactor broke."),
        callout("warning", "When redaction is the wrong tool",
            "Do not hash emails or phone numbers and call it anonymous: the set of possible values is small enough that an unsalted hash can be reversed by hashing a list of candidates, and even a keyed hash is still a stable identifier that links records. Do not ask the model to remove personal data from its own prompt: it is not reliable and the data has already been sent. And do not redact data the feature needs: if the grader must address the learner by name, insert the name after the model call, into the final message, and keep it out of the prompt and the logs."),

        challenge("chal_quiz_lle_231"),

        h2("4. Worked example: one more type with the same technique"),
        p("The API gateway logs of CodeDev also contain client IP addresses, which are personal data too. The redactor for them shows the three parts every type needs: a pattern with explicit neighbours, a key that defines \"the same value\", and a numbering in order of first appearance."),
        code("typescript", `
// IPv4 addresses: four numbers 0-255 separated by dots, not part of a longer number or version string
const IPV4 = /(?<![\\d.])(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?![\\d.])/g;

function redactIps(text: string): { text: string; count: number } {
    const numbers = new Map<string, number>();          // key -> pseudonym number
    let count = 0;
    const out = text.replace(IPV4, (ip) => {
        const key = ip;                                    // the key defines "the same value" (emails: lowercase)
        if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
        count++;
        return \`[IP_\${numbers.get(key)}]\`;
    });
    return { text: out, count };
}

redactIps("GET /courses from 10.0.0.1, retry from 10.0.0.1, then 172.16.4.20 (client v1.2.3.4.5)");
// { text: "GET /courses from [IP_1], retry from [IP_1], then [IP_2] (client v1.2.3.4.5)", count: 3 }`, "redactIps.ts"),
        p("The version string `1.2.3.4.5` survives because the lookahead refuses a match followed by a dot or a digit. Every redaction rule should come with such a negative example in its tests."),
        h3("Order matters"),
        p("When several types run on the same text, run them in an order where an earlier type cannot be damaged by a later one: emails first (an email can contain digits and name-like words), then the 12-digit IDs, then phones (so the first ten digits of an ID are never taken for a phone), then names. Each step works on the text the previous step left, and placeholders such as `[EMAIL_1]` contain nothing the later patterns match."),

        h2("5. Write the redactor"),
        p("Write the function that the prompt logger and the tracing wrapper from lesson 2.2 call before anything is written: emails, citizen IDs, Vietnamese phone numbers and roster names, with consistent pseudonyms, counts per type, and no false positives on the platform's ids and timestamps."),
        challenge("chal_coding_lle_232"),

        h2("6. How to verify a redactor"),
        bullets([
            "**Positive and negative fixtures.** For every type, a file of lines that must be redacted (every phone format, upper-case names, names without diacritics) and a file that must come back unchanged (course ids, submission ids, ISO timestamps, epoch milliseconds, version strings). Both run in CI.",
            "**A canary learner.** Create a test learner in staging with a unique name, email and phone, let them submit and appeal, then search every log and trace store for those three values. Any hit is a leak, and the search can run on a schedule.",
            "**Scan samples of real logs.** Run the patterns from section 2 over a day of redacted logs: the email and phone counts should be zero, and every remaining 12-digit run should be part of an id.",
            "**Watch the counts.** Export the per-type counts as a metric (labelled by feature) and alert on sudden changes in either direction.",
            "**Check outputs too.** Model outputs repeat what was in the prompt; the redactor must run on both.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**`\\b` around digit patterns.** Spot it: submission ids such as `sub-[NATIONAL_ID]` in the logs, and engineers who can no longer find a submission from a log line.",
            "**Redacting in the log store instead of at the source.** Spot it: the raw text is still visible in the agent's buffer, the queue or a third-party service before the redaction step.",
            "**Exact-match names.** Spot it: `Nguyễn Văn An` is redacted, `NGUYEN VAN AN` in the same log is not. Test with the folded and the upper-case form of every roster name.",
            "**One placeholder for everything, or global pseudonyms.** `[REDACTED]` everywhere hides the structure you need to debug; a pseudonym that stays the same across all documents is a user id under another name. Spot it: the same `[EMAIL_7]` appears in traces from different days.",
            "**Only prompts, not outputs.** Spot it: greetings like \"Hi Nguyen Van An\" in the output field of otherwise clean logs.",
        ]),

        h2("8. Summary"),
        bullets([
            "Redact in the process, before a prompt or output is logged or attached to a span; keep the original only where the feature needs it, under its own access rules.",
            "Use patterns with explicit neighbours for emails, phones and ID numbers, a roster with case and diacritic folding for names, and negative fixtures that prove ids and timestamps survive.",
            "Replace values with pseudonyms that are consistent within one document and reset between documents, and count replacements per type to monitor the redactor itself.",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Collect 50 real log lines from a project of yours (or generate them), write the positive and negative fixture files from section 6, and run your redactor over them in a test. Then add one more type that your logs contain - IP addresses, bank account numbers, or student numbers of a partner university - with its own key and a negative example."),
    ],
});
