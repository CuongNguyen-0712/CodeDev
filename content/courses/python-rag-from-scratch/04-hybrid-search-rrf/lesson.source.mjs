// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-py-rag-2-2",
    title: "Hybrid search with Reciprocal Rank Fusion",
    slug: { _type: "slug", current: "rag-hybrid-search-rrf" },
    description:
        "Vector search cannot find \"error E1042\"; BM25 cannot find \"I can't sign in\" when the article says \"login failure\". Learn why adding raw scores from two retrievers fails, and merge their rankings with weighted Reciprocal Rank Fusion.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer on the support assistant team",
        problem:
            "The team switched the assistant from BM25 to embeddings and paraphrased questions got much better. Exact ones got worse: \"sync error E1042\" now returns three generic sync articles, and the page that documents E1042 is ranked 14th - the embedding model treats the code as noise. The first fix added the two scores together, cosine similarity (0 to 1) plus BM25 (0 to about 25). For every query that contains a common word, BM25 now decides the order alone.",
    },

    content: [
        h2("1. The incident: two retrievers, two blind spots"),
        p("Keyword and vector retrieval fail in opposite ways:"),
        bullets([
            "**BM25** matches tokens. It finds `E1042`, `SAML`, `v2.3.1` and product names exactly, but \"can't sign in\" does not match an article titled \"Login failures\".",
            "**Embeddings** match meaning. Paraphrases and other languages work, but rare identifiers are blurred into whatever the model learned about similar-looking strings.",
        ]),
        p("Running both and merging the results - **hybrid search** - recovers most of what either one misses. The hard part is the merge. Scores from different retrievers live on different scales: cosine similarity is between -1 and 1 and bunched near the top, BM25 is unbounded and depends on the query. Adding them lets the larger scale win; normalising each list to 0-1 helps a little, but one outlier still squashes everything else."),

        h2("2. Reciprocal Rank Fusion"),
        p("Reciprocal Rank Fusion (RRF) ignores scores and uses only **positions**. A document at rank r in a list earns `1 / (k + r)`; its fused score is the sum over all lists that contain it:"),
        code("text", `
score(d) = Σ over rankings i that contain d of  w_i / (k + rank_i(d))      k = 60, rank starts at 1`, "rrf.txt"),
        image("rrf-fusion", {
            alt: "BM25 ranks kb-e1042, kb-errors, blog-launch. Vector search ranks kb-sync, kb-errors, kb-e1042. RRF with k = 60 gives kb-e1042 1/61 + 1/63 = 0.032266, kb-errors 1/62 + 1/62 = 0.032258, kb-sync 1/61 = 0.016393 and blog-launch 1/63 = 0.015873, so the documents both retrievers found come first.",
            caption: "Documents that both retrievers found rise to the top; a first place in only one list is worth about half as much.",
        }),
        bullets([
            "**k smooths the curve.** With k = 60 the difference between rank 1 and rank 2 is small (1/61 vs 1/62), so agreement between retrievers matters more than winning one of them. A small k (say 1) rewards the top of each list much more strongly.",
            "**Missing documents get nothing** from a list - there is no penalty, just no contribution. Retrieve the top 50-100 from each retriever so that \"missing\" really means \"not relevant\".",
            "**Weights** express trust: `w = 2` for the keyword list on a support desk full of error codes, or for the vector list on a multilingual site. Tune them on your evaluation set (lesson 3.2).",
        ]),

        h2("3. Implementing it"),
        numbered([
            "**Ranks are 1-based.** `enumerate(ranking, start=1)` - with 0-based ranks the first document of every list gets `1/60` instead of `1/61`, and every score shifts.",
            "**Repeated ids count once per list,** at their first (best) position. A buggy retriever, or two chunks of the same document mapped to its id, must not vote twice. Positions are not renumbered: the document after a duplicate keeps its own rank.",
            "**Weights:** default to 1 per list, and reject a weights list whose length does not match the rankings instead of silently zipping it short.",
            "**Deterministic ties:** symmetric lists give exactly equal scores. Sort by score descending, then by id, so the same input always produces the same order (and the same prompt, and the same cache key).",
        ]),
        code("python", `
def rrf(rankings, top, k=60, weights=None):
    weights = ...                        # default 1 each; ValueError on a length mismatch
    scores: dict[str, float] = {}
    for ranking, weight in zip(rankings, weights):
        seen = set()
        for rank, doc_id in enumerate(ranking, start=1):
            ...
    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    ...`, "fusion.py"),
        challenge("chal_coding_py_rag_221", "Keep a `seen` set per ranking for repeated ids. Sort with the key `(-score, id)` and round only when you build the result."),

        h2("4. Hybrid search in production"),
        bullets([
            "**Run retrievers in parallel** and give each a timeout; if one fails, fuse what you have (RRF works with any number of lists).",
            "**Fuse before reranking.** A cross-encoder reranker is accurate but slow; RRF cheaply narrows 200 candidates to the 20 worth reranking.",
            "**Built-in support:** Elasticsearch/OpenSearch, Weaviate, Qdrant and Postgres-based stacks (pgvector + full-text) all offer RRF or let you run both queries and fuse in the application - the function you just wrote.",
            "**Log the per-retriever ranks** next to the fused rank. When an answer is wrong, you can see which retriever missed the document.",
        ]),
        callout("info", "Why not just normalise the scores?",
            "Min-max normalisation maps each list to 0-1, but the result depends on the best and worst document of that particular query: one near-perfect BM25 match pushes every other keyword result towards 0. Ranks have no such outliers, which is why RRF is the robust default and score-based fusion is the tuned alternative."),

        h2("5. Pitfalls"),
        bullets([
            "**Adding raw scores** from retrievers with different scales.",
            "**0-based ranks** that shift every score.",
            "**Duplicates voting twice** within one list.",
            "**Retrieving too few candidates** per list (top 5), so relevant documents are \"missing\" rather than low.",
            "**Unstable tie order,** which makes prompts, caches and evaluations flaky.",
        ]),

        h2("6. Checklist"),
        bullets([
            "Questions are answered from both a keyword (BM25) and a vector retriever.",
            "Their rankings are merged with RRF (k = 60 to start), never by adding raw scores.",
            "Ranks are 1-based, duplicates count once, and ties are broken by id.",
            "Retriever weights and k are tuned with recall@k / MRR on an evaluation set.",
            "Per-retriever ranks are logged for every answer.",
        ]),
    ],
});
