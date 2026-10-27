// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-3-4",
    title: "Telling users it's AI: transparency duties in Vietnam's AI Law & the EU AI Act",
    slug: { _type: "slug", current: "telling-users-its-ai-transparency-vietnam-ai-law-eu-ai-act" },
    description:
        "A learner spent two hours rewriting a correct solution because \"Mentor Minh\" told her it was wrong - and only then asked whether Minh was a person. Learn what transparency duties Vietnam's Law on Artificial Intelligence and the EU AI Act place on a product that talks to users through AI, why AI in education gets special attention, and the practical design that follows for CodeDev: a clear AI label, a way to report wrong answers, and a grading pipeline in which AI never decides the score.",
    estimatedTime: 20,

    scenario: {
        role: "Developer on the CodeDev learning team, owner of the in-lesson tutor",
        problem:
            "Ticket #2342: a learner writes that \"Mentor Minh\" told her that her solution was wrong and must be rewritten. She spent two hours on it; the original passed every hidden test. She asks whether Minh is a real mentor, and whether Minh's opinion affects her score. At the same time, a product proposal on your desk suggests letting the tutor \"adjust the score by up to 10% for code quality\". Before CodeDev launches the tutor in more courses and to learners in the EU, you must make it clear to users that it is an AI and decide what it may and may not do.",
    },

    content: [
        h2("1. The incident"),
        p("The in-lesson tutor is the same kind of assistant you have been fixing all module: a model, a prompt, retrieved lesson content. The product team gave it a friendly persona. This is what a learner sees when she opens the panel:"),
        code("text", `
+-----------------------------------------------------------+
|  (photo of a smiling young man)   Mentor Minh             |
|  Hi! I'm Minh, your mentor for this lesson.               |
|  Ask me anything - I've reviewed thousands of solutions.  |
|                                                           |
|  Minh: Your solution is wrong. The loop should start at   |
|        index 1. Rewrite it before you submit.             |
+-----------------------------------------------------------+`, "Lesson page, tutor panel (as shipped)"),
        code("text", `
Terms of Service, section 12.4
CodeDev may use automated tools, including artificial intelligence, to improve and
personalise its services.`, "https://app.codedev.test/terms"),
        p("Nothing on the panel says that Minh is an AI. The photo, the name, \"your mentor\" and \"I've reviewed thousands of solutions\" all suggest a person. The only mention of AI is one sentence in the terms, which the learner accepted at sign-up and never read. She trusted the answer the way she would trust a human mentor - and the answer was wrong, the kind of confident wrong answer you met in lesson 3.1."),

        h2("2. Why telling users matters"),
        p("Transparency is not a banner for lawyers. It changes how people use the answer:"),
        bullets([
            "**Calibrated trust.** A learner who knows the tutor is an AI checks its claim against the tests; a learner who thinks it is an experienced mentor rewrites correct code.",
            "**A path to a human.** Knowing it is an AI tells users that a person exists behind it they can ask, and that \"report a wrong answer\" is worth clicking.",
            "**Fair assessment.** When a tool can influence grades, access or progress, people have a stronger interest in knowing what decided the outcome - which is exactly why the law treats education as a sensitive area.",
        ]),

        h2("3. What the laws say"),
        callout("warning", "Not legal advice",
            "This section is a short summary for engineers, written to help you ask the right questions. It is not legal advice and it is not complete. Laws, their implementing decrees and guidance, and the dates on which duties apply can change. Before CodeDev launches an AI feature, the exact text, the current dates and how they apply to the product must be checked with a lawyer."),
        h3("Vietnam: the Law on Artificial Intelligence"),
        bullets([
            "Passed by the National Assembly on 10/12/2025, in force from 01/03/2026.",
            "Classifies AI systems by **risk level**, with stricter duties for higher-risk systems.",
            "Requires that users are **told when they are interacting with an AI system**, rather than being left to assume they are dealing with a person.",
            "Detailed rules are set out in implementing regulations: check which ones are in force for your product and its risk class.",
        ]),
        h3("European Union: the AI Act (Regulation (EU) 2024/1689)"),
        bullets([
            "**Article 50, transparency obligations, applies from 02/08/2026.** An AI system that interacts directly with people must be designed so that they are informed they are interacting with an AI, unless that is obvious from the context. Article 50 also covers marking AI-generated content.",
            "**AI in education is high-risk (Annex III).** Annex III lists AI systems used in education and vocational training, for example to decide access or admission, to **evaluate learning outcomes**, to assess the level of education a person should receive, or to monitor students during tests. High-risk systems carry much heavier duties: risk management, data governance, technical documentation, logging, human oversight, accuracy and robustness.",
            "It matters to CodeDev as soon as the product is offered to people in the EU, even though the company is not based there.",
        ]),
        p("For an engineer, the two laws point to the same three questions, which you can answer in the product itself: **Does the user know it is an AI? Can the user report or contest what it says? Does the AI decide anything about the user on its own?**"),

        h2("4. Practical design for the CodeDev tutor"),
        h3("Label it, where the user reads it"),
        bullets([
            "Show **\"AI tutor\"** on the panel header and next to every AI message, at the first contact - not only in the terms of service or a help page.",
            "A name is fine; a human persona is not. No photo of a person, no \"I've reviewed thousands of solutions\", no claims of experience. Use an icon that reads as a tool.",
            "One line on what it can and cannot do: \"AI tutor - it can be wrong. Your score comes only from the tests.\" with a link to \"How the AI tutor works\".",
        ]),
        h3("Let users report wrong answers"),
        bullets([
            "A \"Report a wrong answer\" action on every AI message, two clicks at most.",
            "The report stores the request id, so the team can replay the exact prompt, documents, model and prompt version (the log line from lesson 3.1).",
            "Reports go to a review queue with an owner and a response time, and every confirmed wrong answer becomes an eval case (lesson 3.2).",
        ]),
        h3("AI never decides grades"),
        bullets([
            "The score comes from the hidden tests only - the same rule the CodeDev platform already follows for every challenge.",
            "AI output is **feedback**, shown and stored separately, labelled as AI feedback, and never an input to the score, to progress, to certificates or to access.",
            "So the \"adjust the score by up to 10%\" proposal is rejected: it would let the model evaluate learning outcomes, the use Annex III names as high-risk, and it would turn every hallucination into a wrong grade. Whether the design as a whole is enough for the product's legal classification is a question for the lawyer; keeping the AI out of the score is the engineering part you control.",
        ]),
        code("typescript", `
type Author = { kind: "human"; name: string } | { kind: "ai"; label: "AI tutor"; model: string; promptVersion: string };
type TutorMessage = { id: string; requestId: string; author: Author; text: string };

function header(m: TutorMessage): string {
  return m.author.kind === "ai" ? \`\${m.author.label} - can be wrong\` : m.author.name;
}

// The grade is a function of the test results only: there is no parameter the AI could fill.
function grade(results: { passed: boolean }[]): { score: number; passed: boolean } {
  const ok = results.filter((r) => r.passed).length;
  return { score: results.length ? Math.round((100 * ok) / results.length) : 0, passed: ok === results.length && ok > 0 };
}`, "tutor/messages.ts"),
        p("The types do the enforcing: a message cannot be rendered without its author kind, and `grade` has no argument through which AI feedback could reach the score. A later proposal to \"just add a quality bonus\" has to change this signature, which makes it visible in review."),

        challenge("chal_quiz_aif_341"),

        h2("5. How to verify"),
        bullets([
            "**A UI test** that renders a conversation with AI messages and asserts that every one shows the \"AI tutor\" label, and that the panel header shows it before the first message.",
            "**A grading test** that runs the same submission with two very different AI feedback texts and asserts the score is identical - and a code review rule that `grade` takes test results only.",
            "**An end-to-end test of the report flow**: report a message, and check that the review queue entry has the request id, model and prompt version.",
            "**A launch checklist** with the legal review as an item that has a name and a date: which law, which articles, which risk class, checked by whom.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Disclosure only in the terms of service.** Spot it: open the feature as a new user and look for the word \"AI\" on the screen where the conversation happens.",
            "**A human persona.** A photo, a human name with a job title, claims of experience. Spot it: ask someone outside the team who wrote the message they see; if they say \"a mentor\", the label failed.",
            "**No way to report.** Users who find a wrong answer have nowhere to send it, and you never learn about it. Spot it: count the reports per week; zero means the button is missing or hidden, not that the AI is perfect.",
            "**Letting AI output leak into decisions.** A quality bonus, an AI \"plagiarism score\" that blocks a certificate, an AI ranking of who gets a scholarship. Spot it: trace every input of the score and of access decisions back to its source.",
            "**Treating this lesson as the legal check.** Spot it: the launch checklist says \"compliant\" without the name of the person who checked the current text.",
        ]),

        h2("7. Summary"),
        numbered([
            "Vietnam's Law on Artificial Intelligence (in force from 01/03/2026) and Article 50 of the EU AI Act (from 02/08/2026) expect users to be told when they are interacting with AI, and the EU treats AI that evaluates learning outcomes as high-risk - check the details with a lawyer before launch.",
            "In the product that means a visible \"AI tutor\" label on every AI message, no human persona, and a short line on what it can and cannot do.",
            "Users can report wrong answers with the request id attached, and AI never decides grades: the score comes from the tests only, AI output stays labelled feedback.",
        ]),

        h2("Sources"),
        bullets([
            "Regulation (EU) 2024/1689 (Artificial Intelligence Act), Article 50 and Annex III point 3 - eur-lex.europa.eu/eli/reg/2024/1689/oj",
            "Law on Artificial Intelligence of Vietnam (passed 10/12/2025, in force 01/03/2026) and its implementing regulations: use the official published text, and ask a lawyer which provisions apply.",
        ]),
        callout("tip", "Self-practice (not graded): an AI feature fact sheet",
            "Write a one-page fact sheet for the CodeDev AI tutor, as you would hand it to the lawyer: what the tutor does, which model and provider it uses, what data goes into its prompts (lesson 3.3), how users are told it is AI (with a screenshot or a sketch of the label), how they report a wrong answer, what it never decides, which countries' users it serves, and the questions you need the lawyer to answer before launch."),
    ],
});
