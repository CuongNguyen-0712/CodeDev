import { readFileSync } from "node:fs";

// The Confident Wrong Answer. A learner asked the CodeDev support bot how to submit a lesson
// whose hidden test still fails, and the bot answered: call submitLesson({ lessonId, force: true }).
// No version of the @codedev/lab SDK ever had a `force` option. Since lab 2.0 (September 2025)
// the call is submitLesson({ lessonId, attemptId }), and tests can never be skipped. The provider
// model's training data ends in January 2025, and the request log shows docs_attached=0.
//
// The retrieval step already finds the right pages of the CodeDev docs and passes them to
// buildPrompt, most relevant first. Fix buildPrompt so that the prompt:
//   - contains the first `options.maxDocs` documents, in the order given (none when maxDocs <= 0),
//     each as a line "[<id>] <title>" followed by a line with its text;
//   - tells the model to answer only from that documentation and to cite the [id] it used;
//   - tells the model to reply "I'm not sure" when the documentation does not answer the question;
//   - still contains the learner's question.
// Do not change the fake model or the test runner.

type Doc = { id: string; title: string; text: string };
type Options = { maxDocs: number };

function buildPrompt(question: string, docs: Doc[], options: Options): string {
    const sources = docs.slice(0, Math.max(0, options.maxDocs));
    return [
        "You are the CodeDev support assistant.",
        "Answer only from the documentation below and cite the [id] of the document you used.",
        "",
        "Documentation:",
        ...sources.map((doc) => `[${doc.id}] ${doc.title}\n${doc.text}`),
        "",
        `Question: ${question}`,
    ].join("\n");
}

// ---------------------------------------------------------------- fake model (do not change)
// No real LLM is called. The fake model replays answers recorded from the provider model
// (chat-small-2025-01, knowledge cutoff 2025-01) for the questions learners asked most.
// What the recordings showed:
//   - Told to answer only from the documentation, with the page that answers the question in the
//     prompt as "[<id>] <title>", it answers from that page and cites it.
//   - Told to answer only from the documentation, without that page, it says "I'm not sure" if the
//     prompt allows that reply, and otherwise still fills the gap with an invented answer.
//   - Without that instruction it answers from what it learned before its cutoff: the invented
//     answer, delivered just as confidently, even when the page is somewhere in the prompt.
type Recording = { question: string; source: string; fact: string; grounded: string; invented: string };

const RECORDINGS: Recording[] = [
    {
        question: "How do I submit my lesson when one hidden test still fails?",
        source: "lab-submit-v2",
        fact: "submitLesson({ lessonId, attemptId })",
        grounded: "Tests cannot be skipped: fix the failing test, run codedev test again and call submitLesson({ lessonId, attemptId }) with the new attempt's id.",
        invented: "Call submitLesson({ lessonId, force: true }) to submit the lesson even when a hidden test fails.",
    },
    {
        question: "How many times can I submit a coding challenge?",
        source: "limits-attempts",
        fact: "at most 5 submissions",
        grounded: "A coding challenge accepts at most 5 submissions.",
        invented: "There is no limit: submit as often as you like, only your best score counts.",
    },
    {
        question: "Does opening the third hint reduce my EXP?",
        source: "hints-exp",
        fact: "halves the challenge EXP",
        grounded: "Yes. Opening the level 3 hint before your first pass halves the EXP of that challenge.",
        invented: "No. Hints are free and never change your EXP.",
    },
    {
        question: "Can I download my certificate as a PDF?",
        source: "certificates",
        fact: "Download PDF",
        grounded: "Yes. Open Profile > Certificates and choose Download PDF.",
        invented: "Yes. Open Settings > Export and choose Certificate (PDF).",
    },
];

const UNSURE = "I'm not sure. The documentation I was given does not cover this.";

function fakeModel(prompt: string): string {
    const recording = RECORDINGS.find((r) => prompt.includes(r.question));
    if (!recording) return "(no recording for this prompt)";
    const onlyFromDocs = /answer only from the (provided )?documentation/i.test(prompt);
    const mayBeUnsure = prompt.includes("I'm not sure");
    const sourceInPrompt = prompt.includes(`[${recording.source}]`) && prompt.includes(recording.fact);
    if (onlyFromDocs && sourceInPrompt) return `${recording.grounded} [${recording.source}]`;
    if (onlyFromDocs && mayBeUnsure) return UNSURE;
    return recording.invented;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { docs, options, questions }. docs = what retrieval returned, most relevant first.
// Prints each question and the fake model's answer to the prompt built for it.
type TestCase = { docs: Doc[]; options: Options; questions: string[] };
const input: TestCase = JSON.parse(readFileSync(0, "utf8"));
for (const question of input.questions) {
    console.log(`Q: ${question}`);
    console.log(`A: ${fakeModel(buildPrompt(question, input.docs, input.options))}`);
}
