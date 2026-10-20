// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-py-rag-2-1",
    title: "Ranking with BM25",
    slug: { _type: "slug", current: "rag-bm25-ranking" },
    description:
        "\"How do I cancel my subscription?\" returns the 5,000-word Terms of Service instead of the 80-word answer. Learn why raw term counts reward long, repetitive pages, how BM25's IDF, saturation and length normalisation fix it, and implement the ranker that keyword search engines still use.",
    estimatedTime: 24,

    scenario: {
        role: "Backend engineer on the support assistant team",
        problem:
            "The first retriever ranked chunks with plain TF-IDF: occurrences of each query word times its inverse document frequency. For \"how do I cancel my subscription\", the top result is a chunk of the Terms of Service that says \"subscription\" 40 times; the 80-word article \"Cancel your subscription in Settings\" is ranked ninth and never reaches the model. A marketing page that repeats \"account security\" in every sentence outranks the actual 2FA guide.",
    },

    content: [
        h2("1. The incident: counting words rewards the wrong pages"),
        p("Raw TF-IDF adds up `count(term) × log(N / df)` for every query term. Two properties make it fail on real help content:"),
        bullets([
            "**No saturation.** The 40th occurrence of \"subscription\" adds as much as the first, so long legal or marketing text that repeats a word wins over a short answer that says it twice.",
            "**No length normalisation.** A 5,000-word page contains almost every word several times. Being long is enough to match everything a little.",
            "**log(N / df) is 0 for a word in every document,** and undefined for a word in none - fine on paper, fragile in code.",
        ]),
        p("BM25 (\"best match 25\", from the Okapi system) is the standard fix. It is still the default ranking in Elasticsearch, OpenSearch and Lucene, and it is the keyword half of almost every hybrid RAG retriever."),

        h2("2. The formula, piece by piece"),
        code("text", `
score(D, Q) = Σ over distinct query terms t present in D of

    IDF(t) · f(t, D) · (k1 + 1)
             ─────────────────────────────────────────
             f(t, D) + k1 · (1 − b + b · |D| / avgdl)

IDF(t) = ln( (N − n(t) + 0.5) / (n(t) + 0.5) + 1 )`, "bm25.txt"),
        bullets([
            "`f(t, D)`: occurrences of t in document D; `|D|`: tokens in D; `avgdl`: average tokens per document; `N`: documents; `n(t)`: documents containing t.",
            "**IDF** rewards rare terms. The `+ 1` inside the logarithm (Lucene's variant) keeps it positive even for a term found in every document; the original Robertson formula goes negative there and lets common words *lower* a score.",
            "**k1 (≈ 1.2-2.0)** sets saturation: the term-frequency part approaches `k1 + 1` however large f grows. The second mention matters, the twentieth barely does. With k1 = 0 a term counts only by presence.",
            "**b (≈ 0.75)** sets length normalisation: a document longer than average needs more occurrences for the same score. b = 0 ignores length; b = 1 applies it fully.",
        ]),
        image("bm25-saturation-length", {
            alt: "Left: the term-frequency part of BM25 rises steeply for the first occurrences and flattens towards k1 + 1 = 2.5, while raw TF-IDF keeps rising in a straight line. Right: for the same 2 occurrences, a 60-word article scores higher than a 600-word page when b = 0.75, and both score the same when b = 0.",
            caption: "Saturation (k1) caps what repetition can earn; length normalisation (b) makes the same mentions count for more in a short document.",
        }),
        challenge("chal_quiz_py_rag_211"),

        h2("3. Implementing it"),
        p("Compute everything that does not depend on the document once: tokens per document, average length, and the IDF of each distinct query term. Then score each document in one pass:"),
        numbered([
            "**Tokenize once** with the same rule as the rest of the pipeline - lower-case words and numbers - and keep the token lists.",
            "**Deduplicate the query** while keeping its order: `list(dict.fromkeys(tokens(query)))`. \"reset RESET password\" is the query `reset password`, not a vote for reset.",
            "**Document frequency** comes from sets of tokens, so a term repeated inside one document counts once in `n(t)`.",
            "**Skip terms the document lacks** (f = 0 contributes nothing), keep only scores > 0, sort by score descending - Python's sort is stable, so equal scores keep the corpus order - and round only when you return.",
        ]),
        code("python", `
from collections import Counter

def bm25_rank(docs, query, k, k1=1.5, b=0.75):
    doc_tokens = [tokens(d["text"]) for d in docs]
    avgdl = ...                       # guard: empty corpus or only empty docs -> []
    terms = list(dict.fromkeys(tokens(query)))
    idf = {t: ... for t in terms}
    for doc, toks in zip(docs, doc_tokens):
        tf = Counter(toks)
        ...`, "bm25.py"),
        challenge("chal_coding_py_rag_212", "Precompute idf and avgdl outside the loop. For each document, the length factor `k1 * (1 - b + b * len(toks) / avgdl)` is the same for every term. Sort by the exact score and round at the very end, so ties are real ties."),

        h2("4. BM25 in a RAG pipeline"),
        bullets([
            "**Exact identifiers win.** Error codes (`E1042`), SKUs, API names and version numbers are rare tokens with high IDF. Embedding models often blur them; BM25 matches them exactly. Lesson 2.2 combines both.",
            "**Tokenization decides recall.** Without stemming, \"refunds\" does not match \"refund\". Add a stemmer or lemmatizer per language, but apply the same one to documents and queries.",
            "**Field weights.** Matching the title is usually worth more than matching the body: score fields separately and add them with weights (BM25F).",
            "**At scale use an index.** The loop here scans every document; Lucene, Tantivy or Postgres full-text search keep posting lists so only documents containing a query term are touched.",
        ]),
        callout("info", "Rank scores are not probabilities",
            "A BM25 score of 4.5 is not \"better\" than an embedding similarity of 0.82 - they are on different scales, and BM25 scores are not comparable across queries either. Never add raw scores from different retrievers; lesson 2.2 fuses rankings instead."),

        h2("5. Pitfalls"),
        bullets([
            "**Raw term frequency** without saturation: repetition and boilerplate win.",
            "**No length normalisation:** long pages match everything.",
            "**IDF without the +1:** common terms get negative weight and can push relevant documents below zero.",
            "**Counting repeated query terms** twice, so a typo-doubled word dominates.",
            "**Different tokenization** for documents and queries.",
            "**Rounding before sorting** turns near-ties into ties and makes the order depend on input position.",
        ]),

        h2("6. Checklist"),
        bullets([
            "Keyword retrieval uses BM25 (k1 ≈ 1.5, b ≈ 0.75 to start), not raw TF-IDF.",
            "IDF uses the +1 variant so it is never negative.",
            "Documents and queries share one tokenizer; query terms are deduplicated.",
            "Only positive scores are returned, sorted by exact score with a stable tie order.",
            "k1 and b are tuned on an evaluation set (lesson 3.2), not by feel.",
        ]),
    ],
});
