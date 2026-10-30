// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ailf-2-1",
    title: "Hallucination & knowledge cutoff: why models are confidently wrong",
    slug: { _type: "slug", current: "hallucination-and-knowledge-cutoff" },
    description:
        "In its first beta week the CodeDev tutor and support bot gave four fluent, specific and wrong answers. Learn why a language model can be confidently wrong, how to tell hallucination, knowledge cutoff, missing context and an ambiguous prompt apart from evidence, and how to check AI answers against a source of truth before anyone acts on them.",
    estimatedTime: 20,

    scenario: {
        role: "Developer on the CodeDev platform team, first week of the AI beta",
        problem:
            "The AI Hint button, the AI tutor chat and the docs support bot went live for 300 beta learners on Monday. By Friday the team has four bug reports that look the same - a confident, detailed answer that turned out to be wrong - and a teammate proposes one fix for all of them: switch everything to model-large. Before anyone changes the model, you have to find out why each answer was wrong.",
    },

    content: [
        h2("1. Four wrong answers in one week"),
        p("The CodeDev platform team shipped its first AI features to a beta group: an **AI Hint** button in the coding editor, an **AI tutor** chat inside lessons and a **support bot** that answers questions about the platform and its public API. All three call `model-small` (the example model from lesson 2: input $0.25 and output $1.25 per 1 million tokens, example prices). On Friday, four bug reports are waiting:"),
        numbered([
            "**The package that does not exist.** In the JavaScript course, AI Hint told a learner: \"Install the helpers with `npm install codedev-test-helpers` and use `assertDeepEqual` from it.\" The learner ran the command and npm answered 404 Not Found.",
            "**The old endpoint.** A mentor asked the support bot how to read the weekly leaderboard. The bot answered `GET /v2/leaderboard?period=week`. The API answers 410 Gone: version 2 was removed in May 2026, and version 3 uses `window=7d` instead of `period`.",
            "**The bug in code it never saw.** A learner asked the tutor \"Why does my solution fail test 3?\" The tutor answered: \"Your loop goes one step too far - change `<=` to `<` in the for statement.\" The learner's solution has no loop at all.",
            "**The wrong kind of reset.** On a challenge page a learner typed \"How do I start over?\" The tutor explained how to leave the course and enrol again, which resets the progress of the whole course. The learner only wanted the editor to go back to the starter code.",
        ]),
        p("To the learner, all four look identical: a fluent, specific, friendly answer that is wrong. To you, they are four different problems with four different fixes. This lesson is about telling them apart."),

        h2("2. Why a model can be confidently wrong"),
        p("Lesson 1 showed what a language model does: it takes the tokens of the prompt and repeatedly predicts a likely next token. Three consequences matter here:"),
        bullets([
            "**Fluency is not truth.** The model is trained to produce text that looks like the text it learned from. A made-up function name in the style of a real library is a very likely sequence of tokens. Nothing in the loop checks the claim against the world.",
            "**The model does not look things up.** Unless your application sends documents in the prompt (lesson 6) or gives the model a search tool, everything it says comes from patterns in its training data plus whatever is in the prompt. It cannot open the CodeDev docs, the npm registry or the learner's editor on its own.",
            "**The tone does not measure the certainty.** An answer about something the model has seen ten thousand times and an answer it is assembling from loose patterns come out in the same confident voice. The model also does not reliably know what it does not know, and it does not know today's date unless you tell it.",
        ]),
        p("Developers notice this. In the Stack Overflow Developer Survey 2025, 46% of developers said they distrust the accuracy of AI tools, and the most common frustration (66%) was AI solutions that are \"almost right, but not quite\". Almost right is exactly what a confidently wrong answer looks like."),
        callout("info", "A word about \"hallucination\"",
            "People use \"hallucination\" for every wrong answer. In this course it means one specific thing: the model states something that was never true - an invented package, parameter, function or citation. Keeping the word narrow is what lets you choose the right fix."),

        h2("3. Same symptom, four causes"),
        p("Each of the four bug reports is an example of one cause. The causes differ in **where the correct information was** when the model answered:"),
        code("text", `
Cause               What happened                          The correct fact was ...
Hallucination       the model invented something that      nowhere - the claim was never true
                    was never true (package, parameter,
                    function, number, citation)
Knowledge cutoff    the model repeated something that      true once, changed after the model's
                    used to be true                        training data ended
Missing context     the model guessed a fact that only     in your system (code, account, internal
                    your system knows                      docs) but never sent in the prompt
Ambiguous prompt    the model answered a different         in the user's head - the question had
                    reading of the question                more than one reasonable meaning`),
        image("wrong-answer-causes", {
            alt: "Four panels with the same symptom at the top: a fluent, specific, wrong answer. Panel 1, hallucination: npm install codedev-test-helpers, a package that was never published; evidence: no record in the registry; fix: verify against the source and allow I am not sure. Panel 2, knowledge cutoff: GET /v2/leaderboard?period=week; evidence: it was correct before the model's cutoff date, the changelog shows v3 later; fix: send current docs. Panel 3, missing context: change <= to < in a loop the learner never wrote; evidence: the learner's code was not in the prompt; fix: send the code and test output. Panel 4, ambiguous prompt: how do I start over, answered as leaving the course; evidence: the answer is right for another reading; fix: add page context or ask a clarifying question.",
            caption: "Four wrong answers that look the same. The cause is where the correct fact was when the model answered.",
        }),
        h3("Hallucination: never true"),
        p("`codedev-test-helpers` was never published to npm, and `assertDeepEqual` was never part of any CodeDev package. The model produced a name that fits the pattern \"company + test + helpers\". Invented package names are a known security problem: in a study reported by CSO Online, about 19.7% of the packages suggested by 16 code-generating models did not exist, and attackers can register those names with malicious code (\"slopsquatting\"). A learner who copies the command is one `npm install` away from running a stranger's code."),
        h3("Knowledge cutoff: true once"),
        p("Every model is trained on data collected up to some date, its **knowledge cutoff**, usually stated on the model card. CodeDev published the v2 API docs in 2024; v3 replaced them in February 2026, after `model-small`'s training data ended. The leaderboard answer was **correct for v2**. The model is not inventing; it is out of date, and it has no way to know that, because nothing in the prompt says what has changed since."),
        h3("Missing context: true in your system, absent from the prompt"),
        p("The tutor prompt contained a system message and the learner's question - but not the learner's code and not the test output. The answer \"change `<=` to `<`\" is the most common off-by-one fix in beginner code, so it is a very likely continuation. The model did what it always does: it produced a plausible answer from what it had. No model, however large, can read code that was never sent."),
        h3("Ambiguous prompt: true for another question"),
        p("\"How do I start over?\" has at least three reasonable readings on CodeDev: reset the editor to the starter code, retake the lesson, or reset the course. The tutor picked one and answered it well. The fix is not a better model but a better question: send the page the learner is on, or let the tutor ask \"Do you want to reset the code in the editor or your progress in the course?\""),
        callout("warning", "One answer, several causes",
            "Real incidents mix causes. An answer can use an endpoint that was correct before the cutoff and add a parameter that never existed. Classify each claim separately - lesson 7 works through such a case."),

        h2("4. Telling them apart from evidence"),
        p("You cannot classify a wrong answer by reading it. You need the evidence around it. Use the same steps every time:"),
        numbered([
            "**Get the exact prompt.** The log must contain the model name, the temperature and every message that was sent, not only the user's question. Without the prompt, \"missing context\" and \"hallucination\" look the same.",
            "**List the factual claims.** Split the answer into checkable claims: an endpoint, a parameter, a package name, a number, a line of the learner's code.",
            "**Check each claim against a source of truth.** The current API spec, the package registry, the learner's actual submission, the platform's real behaviour. A claim you cannot check is not verified, no matter how specific it sounds.",
            "**For a false claim, ask: was it ever true?** Look at the changelog, old docs and old versions. True once and changed after the model's cutoff date: knowledge cutoff. Never true anywhere: hallucination.",
            "**Ask: was the needed fact in the prompt?** If the answer depends on private data (code, progress, internal policy) and the prompt did not contain it: missing context.",
            "**Ask: is there another reading of the question for which the answer is right?** If yes: ambiguous prompt.",
            "**Confirm with an experiment.** Run the same question again with the missing document, code or clarification added. If the answer becomes correct, you found the cause. If it stays wrong, keep looking.",
        ]),
        p("Step 7 is what turns an opinion into evidence. It is also cheap: one more model call per bug report, with everything else unchanged."),

        h2("5. Example: check API claims automatically"),
        p("Step 3 does not have to be manual for everything. The support bot answers questions about a public API, and CodeDev has an API spec. A small checker can extract every `METHOD /path?query` the bot mentions and compare it with the current spec before the answer is shown:"),
        code("javascript", `
// The current public API: route -> allowed query parameters (excerpt).
const API_SPEC = {
    "GET /v3/leaderboard": ["window", "courseId", "limit"],
    "POST /v3/submissions": [],
    "GET /v3/users/{userId}/progress": [],
};

function findUnknownApiCalls(answer, spec) {
    const problems = [];
    const call = /\\b(GET|POST|PUT|PATCH|DELETE)\\s+(\\/[\\w/{}-]*)(?:\\?([\\w=&-]+))?/g;
    for (const [, method, path, query] of answer.matchAll(call)) {
        const key = Object.keys(spec).find((k) => sameRoute(k, \`\${method} \${path}\`));
        if (!key) {
            problems.push(\`unknown endpoint: \${method} \${path}\`);
            continue;
        }
        for (const pair of (query ?? "").split("&").filter(Boolean)) {
            const name = pair.split("=")[0];
            if (!spec[key].includes(name)) problems.push(\`unknown parameter "\${name}" on \${key}\`);
        }
    }
    return problems;
}

// "GET /v3/users/{userId}/progress" matches "GET /v3/users/u_4821/progress"
function sameRoute(template, actual) {
    return new RegExp("^" + template.replace(/\\{[^}]+\\}/g, "[^/]+") + "$").test(actual);
}

console.log(findUnknownApiCalls("Call GET /v2/leaderboard?period=week&limit=10.", API_SPEC));
console.log(findUnknownApiCalls("Use GET /v3/leaderboard?period=week.", API_SPEC));
console.log(findUnknownApiCalls("Use GET /v3/leaderboard?window=7d&limit=10.", API_SPEC));`, "check-api-claims.js"),
        code("text", `
[ 'unknown endpoint: GET /v2/leaderboard' ]
[ 'unknown parameter "period" on GET /v3/leaderboard' ]
[]`, "output (node check-api-claims.js)"),
        p("The checker does not know **why** a claim is wrong - an old endpoint and an invented one both show up as \"unknown\". Classifying still needs the changelog (step 4). What the checker gives you is a cheap, deterministic alarm: an answer with unknown endpoints is never shown as-is, and the count of such answers per day is a number you can track."),
        callout("tip", "The same idea for packages",
            "For AI Hint, keep a list of the packages a course actually allows (or check the project's lockfile) and flag any `npm install` or `import` of a name that is not on it. Never install an AI-suggested package before you have checked that it exists, who publishes it and how long it has been around."),

        h2("6. How to verify, with numbers"),
        p("Fixing four bug reports one by one does not tell you whether the features are getting better. Build a small, repeatable measurement:"),
        bullets([
            "**An evaluation set.** 30 to 50 real questions from the beta (support tickets, tutor chats), each with the correct answer written by a person and the source that proves it. Include questions about things that changed recently and questions that need the learner's own code.",
            "**One run per prompt version.** Run every question, keep the full prompt and answer, and label each wrong answer with its cause: hallucination, cutoff, missing context, ambiguous. The labels tell you which fix to try first.",
            "**Several runs for unstable answers.** As lesson 4 showed, the same prompt can answer differently at temperature 0.7. A wrong claim in 1 run out of 10 is a different problem from one in 10 out of 10.",
            "**A production signal.** Log the checker's result for every support answer and watch the share of answers with unknown endpoints. It should drop when you fix the cause, not when you only change the wording of the prompt.",
        ]),
        p("Now check your reading of the evidence. Each statement below gives you the log or the prompt; classify before you answer."),
        challenge("chal_quiz_ailf_211"),

        h2("7. Common mistakes"),
        bullets([
            "**Trusting specificity.** A precise line number, parameter or price feels like knowledge. Spot it: compare every specific detail in the answer with the prompt - details that were never sent and cannot be checked are guesses.",
            "**Asking the model whether it is sure.** \"Are you sure?\" produces another fluent answer, often an apology and a different guess. Spot it: a verification step that never touches a source outside the model (docs, registry, tests, the real API).",
            "**One fix for every wrong answer.** A bigger model does not know your v3 API or see code you did not send. Spot it: a pull request that changes only the model name, with no before-and-after numbers on an evaluation set.",
            "**Assuming the model knows what is current.** Questions about \"the latest version\" or \"the current API\" are answered from the training data. Spot it: compare the model card's cutoff date with the dates in your changelog.",
            "**Installing what the AI suggests.** Invented package names can be registered by attackers. Spot it: a dependency that is not in the lockfile, has no history, or was published days ago.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Every AI answer in production is logged with the model name, temperature and the full prompt.",
            "Wrong answers are classified per claim: hallucination, knowledge cutoff, missing context or ambiguous prompt.",
            "The cause is confirmed by re-running the question with the missing fact, document or clarification added.",
            "Facts that change (API versions, prices, limits, policies) are sent in the prompt, never left to the model's memory.",
            "Claims that can be checked mechanically (endpoints, packages) are checked before the answer is shown.",
            "An evaluation set with labelled causes is run before and after every prompt or model change.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for LLM Applications 2025 - the Misinformation entry covers hallucination and overreliance: https://genai.owasp.org/llm-top-10/",
            "Stack Overflow Developer Survey 2025, AI section: https://survey.stackoverflow.co/2025/ai",
            "CSO Online, AI hallucinations lead to a new cyber threat: slopsquatting: https://csoonline.com/article/3961304/ai-hallucinations-lead-to-new-cyber-threat-slopsquatting.html",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick a library you use that had a breaking change recently. Ask a chatbot (ChatGPT, Claude, Gemini or a local model with Ollama) how to use the changed function, without giving it any documentation. Then paste the current docs page into the prompt and ask again. Write down the model's stated knowledge cutoff, which claims changed between the two answers, and which cause from this lesson explains each wrong claim."),
    ],
});
