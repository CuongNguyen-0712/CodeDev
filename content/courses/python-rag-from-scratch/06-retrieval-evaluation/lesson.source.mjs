// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-py-rag-3-2",
    title: "Measuring retrieval: recall@k & MRR",
    slug: { _type: "slug", current: "rag-retrieval-evaluation" },
    description:
        "A chunk-size change \"felt better\" in a demo and quietly broke a fifth of refund answers. Learn how to build a golden set, compute recall@k, MRR and hit rate correctly, and gate every retrieval change on numbers instead of impressions.",
    estimatedTime: 22,

    scenario: {
        role: "Backend engineer on the support assistant team",
        problem:
            "Two weeks ago the team raised the chunk size from 200 to 600 words: five demo questions looked better, and it shipped. Since then, thumbs-down on refund and billing answers rose from 9% to 21%. Nobody can say whether the chunk size caused it, because there is no offline evaluation. A quick script now exists, but its numbers make no sense: recall changes when k changes even if nothing new is retrieved, and adding new questions to the test set lowers every metric.",
    },

    content: [
        h2("1. The incident: demos are not measurements"),
        p("Five hand-picked questions cannot tell a 3-point improvement from a 10-point regression, and the person who made the change picks questions the change handles well. Retrieval is the part of RAG that is easiest to measure objectively, because it has a right answer: **did the chunks that contain the answer reach the prompt?** Measure that, and most quality debates become a diff between two numbers."),

        h2("2. A golden set"),
        p("A golden set is a list of real questions, each labelled with the ids of the documents (or chunks) that answer it:"),
        code("json", `
[
  { "query": "how long do refunds take", "relevant": ["kb-refunds", "kb-payments"] },
  { "query": "sync error E1042",         "relevant": ["kb-e1042"] },
  { "query": "reset 2fa",                "relevant": ["kb-2fa"] }
]`, "golden.json"),
        bullets([
            "**Real questions:** sample from logs (anonymised), not from your own imagination. Include short, long, misspelled and multilingual ones.",
            "**Label documents, not chunks,** when chunking is what you want to tune - otherwise every chunking change invalidates the labels.",
            "**100-300 questions** make differences of a few points visible; keep growing the set with every bug report.",
            "**Unlabelled questions** (no relevant document yet) are kept for later but excluded from the metrics, or they silently score zero.",
        ]),

        h2("3. The metrics"),
        p("Run the retriever for every question, keep the ranked ids it returns, and look at the **top-k** - the first k results, exactly as returned, because that is what the prompt will contain:"),
        image("retrieval-metrics", {
            alt: "Query 'how long do refunds take' with relevant documents kb-refunds and kb-payments. The retriever returns kb-billing, kb-refunds, kb-plans, kb-payments. At k = 3 the top-k holds kb-refunds at rank 2: recall@3 = 1/2, reciprocal rank = 1/2, hit = 1. kb-payments at rank 4 is outside the top-k and earns nothing.",
            caption: "Everything below rank k is invisible to the model, so it is invisible to the metrics too.",
        }),
        bullets([
            "**recall@k** = relevant documents found in the top-k / number of relevant documents. \"Did we fetch what the answer needs?\" A relevant id counts once, even if the retriever returned it twice.",
            "**MRR@k** (mean reciprocal rank) = average of 1 / rank of the first relevant document within the top-k, 0 if none. \"How high is the first useful result?\" - it matters because models read the start of the context best.",
            "**hit rate@k** = share of questions with at least one relevant document in the top-k. The easiest number to explain to non-engineers.",
            "**Average over labelled questions only,** and report how many questions that was.",
        ]),
        callout("warning", "Recall is not precision",
            "Dividing the number found by k gives precision@k, a different metric: it falls when you raise k even if nothing new is found. For RAG, recall@k is the one to watch - a missing fact cannot be generated, while an extra chunk mostly costs tokens."),
        p("The team's script computes all three - incorrectly. Fix it before trusting any comparison:"),
        challenge("chal_fix_py_rag_321", "Check each metric on the first sample test by hand: which ids are in the top 3, how many relevant ids exist, and at which rank does the first relevant one appear? Then look at what the loop divides by, which list MRR scans, and which queries are counted in n."),

        h2("4. Gating changes on the numbers"),
        numbered([
            "**Freeze the golden set** for a comparison: same questions, same labels, same k.",
            "**Run baseline and candidate** (old chunk size vs new, BM25 vs hybrid, k1 = 1.2 vs 1.5) and compute the metrics for both.",
            "**Look at the per-question diff,** not just the averages: which questions lost their relevant document? That is your list of regressions to read.",
            "**Set a rule** in CI or in the release checklist - for example \"recall@5 must not drop by more than 1 point, MRR@5 by more than 2\" - and record the numbers with the change.",
        ]),
        code("python", `
baseline = evaluate(run(retriever_v1, golden), k=5)
candidate = evaluate(run(retriever_v2, golden), k=5)
assert candidate["recall_at_k"] >= baseline["recall_at_k"] - 0.01, (baseline, candidate)`, "eval_gate.py"),
        callout("info", "Then evaluate the answers",
            "Retrieval metrics tell you whether the right context arrived. Whether the model used it - faithfulness, correct citations, refusing when the context has no answer - needs answer-level evaluation (human review or an LLM judge with a rubric), built on the same golden set."),

        h2("5. Pitfalls"),
        bullets([
            "**Precision presented as recall:** dividing by k.",
            "**Looking past the top-k:** a document at rank 20 earns MRR@5 credit it never gets in production.",
            "**Duplicates counted twice:** a retriever that repeats a document looks better than one that does not.",
            "**Unlabelled questions as zeros:** every metric drops when the golden set grows.",
            "**Evaluating on the demo questions** that motivated the change.",
            "**Changing labels and code in the same comparison.**",
        ]),

        h2("6. Checklist"),
        bullets([
            "A golden set of real, labelled questions exists and grows with every reported failure.",
            "recall@k, MRR@k and hit rate@k are computed on the top-k as returned, over labelled questions only.",
            "Every retrieval change (chunking, BM25 parameters, fusion weights, k) is compared against a baseline before it ships.",
            "Per-question regressions are reviewed, not only averages.",
            "Answer-level evaluation builds on the same golden set.",
        ]),
    ],
});
