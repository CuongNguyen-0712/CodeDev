// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-py-rag-3-3",
    title: "Right Docs, Wrong Answer? Retrieval or generation",
    slug: { _type: "slug", current: "rag-right-docs-wrong-answer" },
    description:
        "The assistant told an annual-plan customer that refunds take 30 days; the policy says 14. Retrieval found the right chunk and recall@5 did not move, yet the answer was wrong and the citation check said everything was fine. Work through the evidence stage by stage - retrieved, packed, answered - to find where the right chunk got lost, fix the packer, and fix the citation check that hid it.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on the support assistant team, on call",
        problem:
            "Thursday 10:20. A support lead escalates a ticket: an annual-plan customer was told \"The refund arrives within 30 days\" and complained when the policy page says 14. Since Monday, agents rate 69% of sampled refund and billing answers correct, down from 88%. In the incident channel the first reply is \"retrieval is broken again, let's raise k\". The retrieval dashboard disagrees: recall@5 is 0.94, exactly what it was last week. The automatic citation check passes 99% of sentences, more than ever.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course's scenario lesson: one real kind of failure, with the evidence you would have on call. A RAG answer goes through three stages, and each one can lose the fact the user needs:"),
        code("text", `
question -> RETRIEVE (top-k chunks) -> PACK (prompt under a token budget) -> GENERATE (answer + citations)
            lessons 2.1-2.3                lesson 3.1                         this lesson's check`, "pipeline.txt"),
        p("\"The answer is wrong\" says only that the fact did not survive all three. Before anyone changes k, the chunk size or the model, the first job is to find **the first stage where the right chunk was lost**. Every stage leaves a trace you can read; the goal of this lesson is reading them in order."),

        h2("2. The evidence pack"),
        p("Five pieces of evidence were collected for the escalated question. The quiz refers to them by letter."),
        h3("A. Retrieval (hybrid search with RRF, lesson 2.2)"),
        code("text", `
query: "how long does a refund take on an annual plan?"
rank  chunk                 rrf     cost (tokens)
1     kb-refunds#1          0.0325  13
2     kb-refunds-annual#1   0.0323  35
3     kb-cancel#2           0.0317  11
4     kb-credit#1           0.0161   9
5     blog-pricing#3        0.0156  41

golden-set label for this question: relevant = [kb-refunds-annual]`, "retrieval log"),
        p("The full text of the rank-2 chunk, from the index:"),
        code("text", `
kb-refunds-annual#1: Annual plans are refunded pro rata for the unused months, minus any discount
that was applied at checkout. Refunds for annual plans are paid within 14 days of cancellation.`, "index"),
        h3("B. The packed context the model received"),
        code("text", `
[1] Store credit is issued instantly.
[2] Cancel any time from Settings > Billing.
[3] Refunds are processed within 30 days of the request.
[4] Annual plans are refunded pro rata for the unused months, minus any discount`, "prompt log, <context> block, budget 50 tokens"),
        h3("C. Packer log"),
        code("text", `
pack_context budget=50 strategy=fill (release 2026.10.20)
packed  kb-credit#1           9        as [1]
packed  kb-cancel#2          11        as [2]
packed  kb-refunds#1         13        as [3]
cut     kb-refunds-annual#1  35 -> 17  as [4]
total   50/50`, "packer debug log"),
        h3("D. The answer and the automatic citation check"),
        code("text", `
Annual plans are refunded pro rata for the unused months [4]. The refund arrives within 30 days [4].

citation check: 2/2 sentences supported`, "answer log"),
        h3("E. Evaluation, before and after the release"),
        code("text", `
                          2026.10.13   2026.10.20
recall@5 (212 questions)    0.94         0.94
MRR@5                       0.81         0.81
citation check pass rate    0.97         0.99
agent review: correct       0.88         0.69     (120 sampled refund and billing answers)`, "weekly eval report"),

        h2("3. Reading the evidence: walk the pipeline"),
        p("Ask one question per stage, in pipeline order, and answer it from the evidence - not from what the team expects:"),
        numbered([
            "**Retrieved?** Is a relevant chunk in the top-k? If not, it is a retrieval failure: tune chunking, BM25, fusion or the embeddings (lessons 1.1-2.3) and measure with recall@k (lesson 3.2). Here A says yes, at rank 2.",
            "**Packed whole, and where?** Is that chunk in the prompt, complete, and near the top? If it was retrieved but dropped, cut or buried, it is a packing failure - and recall@k cannot see it, because recall is measured on the retriever's output, before packing.",
            "**Answered from the context?** Does every claim come from the source it cites? If the model had the fact and still answered wrongly, or cited a source that does not say what it claims, it is a generation failure: prompt, model or output checks.",
        ]),
        p("The stage where the chunk is lost is where the fix belongs. Fixing a later stage hides the symptom; fixing an earlier one changes something that was working. That is why \"raise k\" is the wrong reflex here: E shows recall unchanged since the release, and A shows the right chunk already retrieved."),
        callout("info", "When this ladder is not enough",
            "If the relevant chunk is in the prompt, whole and first, and the answer still contradicts it, the cause is generation - but check the label too. Golden-set labels go stale when policies change; a \"wrong\" answer that matches a newer policy page is a labelling problem, not a model problem."),
        challenge("chal_quiz_py_rag_331"),

        h2("4. Hypothesis: the packer lost the chunk"),
        p("Put the evidence together and one stage stands out. The release on 2026.10.20 changed only the packer, with the PR title \"pack more chunks, waste no budget\":"),
        code("text", `
 def pack_context(chunks, budget, max_per_source):
     ...
-    for chunk in chunks:                                  # rank order
+    for chunk in sorted(chunks, key=cost):                # cheapest first: more chunks fit
         ...
         if tokens + cost > budget:
-            continue                                      # skip, a later one may fit
+            lines.append(cut_to(line, budget - tokens))   # fill the budget, waste nothing
+            break`, "PR #611 \"pack more chunks, waste no budget\""),
        p("The hypothesis explains every piece of evidence: the cheapest chunks come first (C), the best chunk for the question becomes the last line and is cut after \"minus any discount\" (B), so the 14 days never reach the model. The model answers with the closest number it has - the 30 days of the general policy in [3] - and attaches [4] (D). Recall does not move because retrieval did not change (E). Average chunks per prompt went up, which is what the PR wanted, and answer quality went down."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"Retrieval regressed.\"** A has the relevant chunk at rank 2; E shows recall@5 and MRR@5 identical before and after. Nothing about the retriever changed.",
            "**\"The model hallucinates.\"** Partly true - the model did attach a citation to a claim its source does not make - but it could not quote a sentence it never received. Swapping the model would leave the 14 days out of the prompt.",
            "**\"The answer is correct, the customer misread it.\"** The policy says 14 days; the answer says 30. The agent review in E confirms it is not one ticket.",
        ]),
        p("And one more piece of evidence needs its own explanation: why did the citation check pass a sentence citing [4] for a number that [4] does not contain - and why did its pass rate go **up**? Keep that question; section 6 answers it."),

        h2("5. The fix: rank order, skip, never cut"),
        p("Revert to the rules from lesson 3.1: pack in rank order, skip a chunk that does not fit, never cut one. The retriever's order is the best estimate of usefulness you have; reordering by size optimises the wrong thing. And a chunk cut at a token boundary is worse than no chunk at all: it looks like a source, takes a citation number, and can end in the middle of the very sentence that mattered."),
        p("Check the fix on the incident before you write any code: in rank order, kb-refunds#1 costs 13 and kb-refunds-annual#1 costs 35. 13 + 35 = 48, within the same 50-token budget, so both fit whole. If you really need to use leftover budget, add **whole sentences** of a skipped chunk and mark them as partial in the citation; and if a key chunk routinely does not fit, split it at index time (lesson 1.1), where you control the boundaries."),
        code("python", `
CHUNKS = [  # rank order, as in evidence A
    {"id": "kb-refunds#1", "source": "kb-refunds",
     "text": "Refunds are processed within 30 days of the request."},
    {"id": "kb-refunds-annual#1", "source": "kb-refunds-annual",
     "text": "Annual plans are refunded pro rata for the unused months, minus any discount that "
             "was applied at checkout. Refunds for annual plans are paid within 14 days of cancellation."},
    {"id": "kb-cancel#2", "source": "kb-cancel", "text": "Cancel any time from Settings > Billing."},
    {"id": "kb-credit#1", "source": "kb-credit", "text": "Store credit is issued instantly."},
]


def test_best_chunk_is_packed_whole_and_in_rank_order():
    packed = pack_context(CHUNKS, budget=50, max_per_source=2)     # lesson 3.1
    assert packed["used"] == ["kb-refunds#1", "kb-refunds-annual#1"]
    assert "within 14 days of cancellation." in packed["context"]
    assert all(line.rstrip().endswith((".", "!", "?")) for line in packed["context"].splitlines())`, "test_packer.py"),
        p("The last assertion is the cheap guard against the whole class of bug: every packed line ends where a sentence ends."),

        h2("6. Verify - and fix the check that hid it"),
        p("\"The ticket's question is answered correctly now\" is one data point. Verify at the level the incident happened:"),
        bullets([
            "**Add a packing metric next to recall@k.** For each golden question: is a relevant chunk in the packed context, whole? Call it context recall. Recall@5 stayed at 0.94 during the incident; this number would have fallen on the day of the release.",
            "**Re-run the answer-level review** on the same 120 sampled questions; the correct rate should return to its level before the release.",
            "**Replay the escalated question** and read B and D again: [2] should be the full annual-plan chunk, and the answer should say 14 days and cite it.",
        ]),
        p("Then the citation check. It exists to catch exactly D: a claim attached to a source that does not say it. It reported 2/2. The reason is in E: its pass rate rose from 0.97 to 0.99 as answers got worse. A guard whose numbers improve while quality falls is not measuring what you think. Reading its code shows three problems: it searches the **whole context** for each number instead of the cited source, it compares numbers as substrings (\"3\" is found inside \"30\"), and it keeps only one line per source, although lesson 3.1 gives two chunks of one source the same number."),
        challenge("chal_fix_py_rag_332"),
        callout("tip", "A lexical check is a floor, not a judge",
            "Comparing numbers between a claim and its cited source catches the most expensive wrong answers - days, prices, limits, error codes - in microseconds, and it cannot be talked out of a result. It cannot judge paraphrases or reasoning; for those, add an LLM judge or human review on a sample, built on the same golden set. Run the cheap check on every answer and the expensive one on a sample."),

        h2("7. Common mistakes when the answer is wrong"),
        bullets([
            "**Starting with the retriever.** Spot it: the first proposed fix changes k, chunk size or fusion weights before anyone checked whether the relevant chunk was already retrieved.",
            "**Reading the retriever's output instead of the prompt.** Spot it: the investigation quotes the chunk from the index, not the packed context the model received. Log the exact context with every answer.",
            "**Trusting retrieval metrics for an end-to-end problem.** Spot it: recall@k is flat while answer quality falls. Measure each stage: recall@k, context recall, citation support, answer correctness.",
            "**Cutting chunks to fill a budget.** Spot it: packed lines that do not end at a sentence boundary, or a cut chunk that takes a citation number.",
            "**Guards that check the whole context.** Spot it: a citation pass rate that rises when quality falls. Check each claim against the source it cites, and only that source.",
        ]),

        h2("8. Summary"),
        numbered([
            "Walk the pipeline in order - retrieved, packed whole, answered from the cited source - and fix the first stage where the right chunk was lost.",
            "recall@k is measured before packing; a packer that reorders, drops or cuts chunks breaks answers with recall unchanged. Measure context recall and answer correctness too.",
            "A citation check must compare each claim with the source it cites, as whole numbers; one that searches the whole context will pass the wrong answer it was built to catch.",
        ]),
        callout("tip", "Self-practice (not graded): write the incident report",
            "Write the incident report as you would post it in the incident channel, in at most twelve lines: what customers saw, the impact (share of refund and billing answers affected, since when), the stage where the right chunk was lost and why, why recall@5 and the citation check did not alert, the fix and how it was verified, and two follow-ups that would catch the next one earlier (for example context recall in the weekly eval and a sentence-boundary assertion in the packer tests). Every claim should point at one piece of evidence, A to E."),
    ],
});
