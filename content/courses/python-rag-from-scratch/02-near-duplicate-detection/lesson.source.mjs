// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-py-rag-1-2",
    title: "Near-duplicate detection with shingles & Jaccard",
    slug: { _type: "slug", current: "rag-near-duplicate-detection" },
    description:
        "Three copies of the same article fill the assistant's top five results. Learn why exact hashes miss near-duplicates, how word shingles and Jaccard similarity measure overlap, and fix a dedupe step that lets copies through and drops the wrong documents.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer on the support assistant team",
        problem:
            "The knowledge base is now imported from three tools: the help center, PDF exports and Confluence. The same article arrives two or three times - once with a \"Last updated\" footer, once with different capitalisation. The retriever returns its top 5 chunks, and for 31% of questions at least two of them are copies of the same paragraph. The context has room for fewer distinct facts, and the model repeats itself. The import job already removes exact duplicates with a SHA-256 of the text; it removes almost nothing.",
    },

    content: [
        h2("1. The incident: exact hashes miss almost every copy"),
        p("A hash changes completely when one character changes. Two copies of an article that differ by a trailing period, a capital letter or a footer have unrelated hashes, so hash-based dedupe only catches byte-identical files:"),
        code("python", `
import hashlib

def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()

fingerprint("Refunds are processed within 30 days.")   # 'c1f0...'
fingerprint("refunds are processed within 30 days")    # '7a9e...' - a different document?`, "import_kb.py"),
        p("Normalising before hashing (lower-case, strip punctuation, collapse whitespace) catches a few more copies, but not the footer or an edited sentence. What we need is a **similarity**: how much of the text two documents share."),

        h2("2. Shingles and Jaccard similarity"),
        p("A **shingle** is a run of `k` consecutive tokens. A document becomes the **set** of its shingles - order inside the set does not matter, but each shingle keeps local word order, so \"reset your password\" and \"password your reset\" share nothing at k = 3."),
        p("The **Jaccard similarity** of two sets is the size of their intersection divided by the size of their union: 1.0 for identical sets, 0.0 for nothing in common. A footer of 4 words adds a few shingles to one copy; the union grows a little, the intersection stays large, and the similarity stays above the threshold."),
        image("shingles-jaccard", {
            alt: "Two copies of a 2FA article. Copy A has 21 word 3-shingles, copy B has the same 21 plus 4 from a footer. The intersection holds 21 shingles, the union 25, so the Jaccard similarity is 21 / 25 = 0.84, above the 0.8 threshold: B is dropped. A short FAQ quoting 9 of A's shingles has similarity 9 / 21 = 0.43 and is kept.",
            caption: "Similarity is intersection over union. A copy with a footer stays above the threshold; a short quote of the article does not.",
        }),
        numbered([
            "**Tokenize the same way for every document:** lower-case, keep words and numbers, drop punctuation. Otherwise \"Refunds\" and \"refunds,\" are different tokens.",
            "**Build all shingles:** a text of n tokens has n - k + 1 shingles. Missing the last one makes texts that differ only in their last word look identical.",
            "**Short texts:** a text with fewer than k tokens is one shingle (all of its tokens); an empty text has none, and two empty sets count as identical.",
            "**Divide by the union.** Dividing by one side measures containment - \"is A inside B?\" - which flags every short quote of a long article as a duplicate.",
        ]),
        callout("info", "Choosing k and the threshold",
            "k = 3 to 5 word shingles is typical for paragraphs; smaller k makes unrelated texts look similar, larger k makes small edits look large. Start the threshold around 0.8, then look at the pairs just above and below it in your own data before you trust it."),

        h2("3. The dedupe step"),
        p("The import keeps the first copy it sees and drops a later document when it is similar enough to a document **already kept**. Comparing with dropped documents as well lets duplicates chain: B is a copy of A and is dropped, C is a copy of B but clearly different from A - and gets dropped anyway."),
        code("python", `
def dedupe(docs: list[dict], k: int, threshold: float) -> list[str]:
    kept: list[tuple[str, set[Shingle]]] = []
    for doc in docs:
        signature = shingles(doc["text"], k)
        if any(jaccard(signature, other) >= threshold for _, other in kept):
            continue                      # near-duplicate of a kept document
        kept.append((doc["id"], signature))
    return [doc_id for doc_id, _ in kept]`, "dedupe.py"),
        p("The loop is fine. The helpers it calls are not: the version in production lets copies through, drops FAQ entries that quote an article, treats texts that differ only in their last word as identical, and crashes on an empty document. Find and fix the three helpers."),
        challenge("chal_fix_py_rag_121", "Test each helper on a tiny input in your head: what does tokens(\"Refunds, refunds!\") return, how many shingles does a 7-token text have at k = 3, and what is jaccard() of a 4-shingle set that sits inside a 21-shingle set?"),

        h2("4. At scale: MinHash and LSH"),
        p("Comparing every new document with every kept one is O(n²) - fine for a few thousand articles, too slow for millions of web pages. Two standard techniques keep the same idea and make it fast:"),
        bullets([
            "**MinHash** replaces each shingle set with a short signature (for example 128 numbers). The fraction of positions where two signatures agree estimates their Jaccard similarity, with no set operations.",
            "**Locality-sensitive hashing (LSH)** splits signatures into bands and only compares documents that collide in at least one band, so most pairs are never compared at all.",
            "Libraries such as `datasketch` implement both; the threshold you tuned with exact Jaccard carries over.",
        ]),
        callout("tip", "Dedupe chunks too",
            "Run the same check on chunks after splitting. Boilerplate - cookie notices, navigation, legal footers - produces near-identical chunks in hundreds of documents, and they crowd out real answers just like duplicate articles do."),

        h2("5. Pitfalls"),
        bullets([
            "**Hashing raw text:** only byte-identical copies are removed.",
            "**Inconsistent tokenization** between documents, or between import and query time.",
            "**Containment instead of Jaccard:** short quotes and summaries disappear from the index.",
            "**Off-by-one shingles:** the last k tokens of every document are ignored.",
            "**Comparing with dropped documents:** duplicates chain and remove distinct articles.",
            "**Silent deletion:** log every dropped id with the id it duplicates, so a wrong threshold can be noticed and reverted.",
        ]),

        h2("6. Checklist"),
        bullets([
            "Documents are normalised (case, punctuation, whitespace) with one shared tokenizer.",
            "Near-duplicates are found with Jaccard similarity of word shingles, not exact hashes.",
            "The threshold is checked against real pairs on both sides of it.",
            "A document is compared only with documents that were kept; the first copy wins.",
            "Dropped documents are logged with the document they duplicate.",
            "Large corpora use MinHash + LSH instead of comparing every pair.",
        ]),
    ],
});
