// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-py-rag-2-3",
    title: "Spot the AI mistake: cosine similarity without normalization",
    slug: { _type: "slug", current: "rag-spot-unnormalized-cosine" },
    description:
        "An AI assistant wrote the vector search, called it cosine similarity, and ranked by the raw dot product. It passed review because every test vector had length 1 - until the PDF import stored long vectors and the 4,000-word refund policy started winning every query. Learn what the dot product really measures, when it is fine, and how to catch the missing normalization with a test that scales a vector.",
    estimatedTime: 18,

    scenario: {
        role: "Backend engineer on the support assistant team",
        problem:
            "Last week an AI assistant wrote vector_search() for the hybrid retriever (lesson 2.2) from a short request: rank chunks by cosine similarity. It passed review and its tests. On Monday the PDF import went live, and support agents started forwarding answers that quote the refund policy for questions about sync errors, 2FA and invoices. The vector list in the retrieval log has the same two PDF pages at ranks 1 and 2 for almost every query, with scores of 4.92 and 2.40 - for a similarity that is supposed to stay between -1 and 1.",
    },

    content: [
        h2("1. The incident: scores that cannot be cosines"),
        p("The team logs every retrieval with the per-retriever ranks (lesson 2.2). For the question \"sync error E1042\", the vector side of the log looks like this:"),
        code("text", `
query: "sync error E1042"            query_norm=1.000
rank  chunk                    score   norm    words  source
1     pdf-refund-policy#p3     4.9200  7.643   4,112  pdf import (sum of 41 paragraphs)
2     pdf-terms#p7             2.4000  4.031  2,380  pdf import (sum of 23 paragraphs)
3     kb-e1042#1               1.0000  1.000     180  embeddings API
4     kb-sync#2                0.9600  1.000     210  embeddings API`, "retrieval log, vector retriever"),
        p("Two facts in this log are enough to suspect the code before reading it. Cosine similarity is bounded by -1 and 1, and 4.92 is not. And the ranking follows the **norm** column - the length of each vector - almost exactly. The PDF import builds one vector per page by adding up the vectors of its paragraphs, so a page with 41 paragraphs gets a vector about 41 times longer than one paragraph's, pointing in an average direction. Something in the search lets that length decide."),

        h2("2. The request and the AI's answer"),
        p("This is the request the team sent, word for word:"),
        code("text", `
Write vector_search(query, chunks, top) for our support assistant. Rank the chunks by cosine
similarity between their embedding and the query embedding and return the best \`top\` as
{"id", "score"}, with the score rounded to 4 decimals. Highest score first, ties by id.
A chunk whose vector is all zeros has no direction: skip it. If the query vector is all zeros,
return an empty list.`, "request to the AI assistant"),
        p("And the code that came back. Read it as a reviewer would, before you read on:"),
        code("python", `
def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def vector_search(query: list[float], chunks: list[dict], top: int) -> list[dict]:
    if not any(query):
        return []
    scored = []
    for chunk in chunks:
        vector = chunk["vector"]
        if not any(vector):
            continue  # a zero vector has no direction
        # cosine similarity of the two embeddings: higher means more similar
        score = round(dot(query, vector), 4)
        scored.append({"id": chunk["id"], "score": score})
    scored.sort(key=lambda item: (-item["score"], item["id"]))
    return scored[:top]`, "search.py (as merged)"),
        p("Everything the request spelled out is there: zero vectors are skipped, the zero query returns nothing, ties are broken by id, scores are rounded. The comment says cosine similarity. The formula is not cosine similarity - and that is exactly the kind of mistake that survives review, because the reviewer checks the listed requirements and trusts the comment for the one that looks obvious."),

        h2("3. What the dot product measures"),
        p("For two vectors q and v:"),
        code("text", `
dot(q, v)    = q1*v1 + q2*v2 + ... + qn*vn
             = |q| * |v| * cos(angle between q and v)

cosine(q, v) = dot(q, v) / (|q| * |v|)          |v| = sqrt(v1² + ... + vn²)`, "dot-vs-cosine.txt"),
        bullets([
            "**Cosine** depends only on the angle: same direction 1, unrelated (orthogonal) 0, opposite -1. Scaling either vector by 10 changes nothing.",
            "**The dot product** is the cosine multiplied by both lengths. Scaling a chunk vector by 10 multiplies its score by 10. For the query that is harmless - every chunk is multiplied by the same |q| - but the chunk lengths differ, so they reorder the results.",
            "**Where long vectors come from:** sum pooling (adding token or paragraph vectors, like the PDF import), mixing vectors from two models or two pipelines in one index, or a model that was never trained to produce unit vectors. Long texts tend to get long vectors, so the bias is towards long chunks - the ones that cost the most tokens in the prompt.",
        ]),
        h3("When the dot product is the right choice"),
        p("Ranking by dot product is not a bug in itself. Many embedding APIs return vectors that are already normalized to length 1, and then the dot product **equals** the cosine and is cheaper: no square roots per chunk. The usual design is to normalize every vector once when it is stored and use the dot product (an inner-product index) at query time. Some retrieval models are also trained for the dot product on purpose, and their vector length carries information the model learned; switching those to cosine can make results worse. The rule is: use the similarity the model was trained with, and know the norms of what is in your index."),
        challenge("chal_quiz_py_rag_231"),

        h2("4. Why the tests did not catch it"),
        p("The tests that came with the AI's code built their vectors the way the embeddings API does - unit length. For unit vectors the buggy formula and the correct one return the same numbers, so every assertion passed. The tests confirmed that the code agreed with itself on the one kind of input where the bug is invisible."),
        p("A test that can catch this bug has to break the assumption the code silently relies on. Two cheap ones:"),
        numbered([
            "**Scale invariance:** multiply one chunk vector by 10. Its score and its rank must not change. With the dot product, the score is multiplied by 10.",
            "**Range:** every score must be between -1 and 1 (allow a tiny tolerance for floating-point error). A score of 4.92 fails at once.",
        ]),
        code("python", `
CHUNKS = [{"id": "kb-e1042", "vector": [0.6, 0.8, 0.0]},
          {"id": "pdf-policy", "vector": [0.42, 0.30, 0.51]}]


def test_scaling_a_chunk_vector_changes_nothing():
    query = [0.6, 0.8, 0.0]
    before = vector_search(query, CHUNKS, top=2)
    scaled = [CHUNKS[0], {"id": "pdf-policy", "vector": [x * 10 for x in CHUNKS[1]["vector"]]}]
    assert vector_search(query, scaled, top=2) == before


def test_scores_are_cosines():
    for hit in vector_search([3.0, 4.0, 0.0], CHUNKS, top=10):
        assert -1.0 - 1e-9 <= hit["score"] <= 1.0 + 1e-9`, "test_search.py"),
        callout("tip", "Write the test for the property, not the example",
            "\"Cosine similarity\" is a promise about invariance - only the angle counts. Tests that state the promise (scale a vector, check the range, swap the arguments) catch whole families of bugs. Tests that copy one example from the documentation catch only that example, and an AI that wrote the code will happily write that example too."),

        h2("5. Fixing it"),
        p("The fix divides by both lengths and keeps every rule the request listed. Python's standard library has what you need: `math.hypot(*v)` computes the Euclidean length of a vector of any dimension, and `math.sumprod(a, b)` (Python 3.12+) computes the dot product with better floating-point accuracy than a plain `sum`:"),
        code("python", `
import math

length = math.hypot(*[3.0, 4.0])                        # 5.0
dot = math.sumprod([3.0, 4.0], [0.6, 0.8])              # 5.0
cosine = dot / (length * math.hypot(*[0.6, 0.8]))       # 1.0 - same direction`, "cosine.py"),
        bullets([
            "**Divide by both norms.** Dividing only by the query's length rescales every score by the same number: the ranking stays wrong. Dividing only by the chunk's length fixes the ranking but the scores are no longer cosines, so any threshold (\"answer only if the best score is above 0.75\") breaks for non-unit queries.",
            "**Keep the zero checks before you divide.** A zero vector has no direction; dividing by its length raises `ZeroDivisionError`.",
            "**Round, then sort.** Two vectors with the same direction and different lengths should tie exactly; rounding first makes floating-point noise in the last digits irrelevant, and the id decides.",
        ]),
        p("Now fix the AI's code. The public tests pass on it already - they use unit vectors, like the original ones. The hidden tests do not:"),
        challenge("chal_fix_py_rag_232"),

        h2("6. How to verify in production"),
        bullets([
            "**Check the norms of the index.** One query over the stored vectors - minimum, maximum and a few percentiles of their lengths - tells you whether the dot product and cosine can disagree. If you normalize at write time, assert `abs(norm - 1) < 1e-3` in the ingestion job so a new pipeline cannot slip long vectors in.",
            "**Read the retrieval log for impossible scores.** Cosine scores above 1, and ranks that follow vector length or chunk length, are the signature of this bug.",
            "**Compare on the golden set.** Run recall@5 and MRR@5 (lesson 3.2) before and after the fix, and look at the questions that changed: error-code questions like \"sync error E1042\" should recover their article.",
            "**Know your vector store's operator.** pgvector, for example, has separate operators for cosine distance (`<=>`) and negative inner product (`<#>`); inner product on unnormalized vectors has the same bias as the AI's code.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Calling the dot product \"cosine\".** Spot it: scores above 1 in the logs, or a score formula without a division.",
            "**Normalizing only the query.** Spot it: the scores shrink, the ranking does not change - scale one chunk vector by 10 in a test and its rank still moves.",
            "**Testing only with unit vectors.** Spot it: every test vector comes from the embeddings API or is hand-written with length 1. Add one long vector and one non-unit query.",
            "**Mixing vector sources in one index.** Spot it: the norm column in the log has two clusters (1.0 for the API, 4-8 for the PDF import). Normalize at write time, or keep one model and one pooling method per index.",
            "**Dividing by a zero length.** Spot it: `ZeroDivisionError` on empty or failed embeddings. Skip zero vectors, and log them - an all-zero embedding usually means the embedding call failed.",
        ]),

        h2("8. Summary"),
        numbered([
            "The dot product is |q| * |v| * cos: when stored vectors have different lengths, length decides the ranking, and long chunks win.",
            "It is correct, and cheaper, when every vector is unit length - so normalize once at write time, or divide by both norms at query time.",
            "Tests made of unit vectors cannot see this bug; test the property (scale a vector, check the -1..1 range) and check the norms of the index.",
        ]),
    ],
});
