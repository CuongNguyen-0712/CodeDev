// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-py-rag-1-1",
    title: "Chunking documents with overlap",
    slug: { _type: "slug", current: "rag-chunking-with-overlap" },
    description:
        "The support assistant answers \"refunds are possible within days\" because the number sat on a chunk boundary. Learn why retrieval works on chunks, how window size and overlap trade recall against cost, and write the overlapping word chunker the rest of the course builds on.",
    estimatedTime: 22,

    scenario: {
        role: "Backend engineer on the support assistant team",
        problem:
            "The assistant answers billing questions from 1,800 help-center articles. Since launch, 14% of refund answers are wrong or vague: \"refunds are possible within days\", \"contact support for the deadline\". The articles are correct. The ingestion job cuts every article into fixed 1,000-character pieces before embedding them, and the sentence \"Refunds are processed within 30 days of the request\" was split after \"within\" - the retriever finds half of the fact, and the model guesses the rest.",
    },

    content: [
        h2("1. The incident: half a fact is worse than none"),
        p("Retrieval-augmented generation (RAG) answers a question in two steps: **retrieve** the passages most similar to the question, then **generate** an answer from them. Nothing is retrieved at document level - documents are too long to embed well and too long to fit in a prompt - so every document is first cut into **chunks**. Each chunk is embedded and indexed on its own, and only chunks ever reach the model."),
        p("The ingestion job did the simplest thing that works on a demo:"),
        code("python", `
def chunk_chars(text: str, size: int = 1000) -> list[str]:
    return [text[i:i + size] for i in range(0, len(text), size)]`, "ingest.py"),
        p("Three things go wrong at scale:"),
        bullets([
            "**Boundaries cut facts.** A character window ends wherever it ends: inside a sentence, a word or a number. \"within 3\" | \"0 days\" is two useless chunks.",
            "**The boundary context is lost.** A question about the end of one chunk often needs the start of the next one. Without overlap, no single chunk holds both.",
            "**Size is measured in the wrong unit.** Embedding models and prompts are limited in tokens, which track words far better than characters - especially across languages and code.",
        ]),

        h2("2. Windows and overlap"),
        p("A **sliding window** over the words of a document fixes all three. Each chunk holds at most `size` words, and consecutive chunks share `overlap` words, so each chunk starts `size - overlap` words after the previous one:"),
        image("sliding-word-windows", {
            alt: "Ten words a to j split into windows of 4 words with an overlap of 1: chunk 1 is a b c d, chunk 2 is d e f g, chunk 3 is g h i j. The shared words d and g sit in two chunks each. The third window reaches the last word, so the chunker stops.",
            caption: "Windows of 4 words, overlap 1: every boundary word lives in two chunks, and the chunker stops at the window that reaches the end.",
        }),
        p("Before writing it, check that you can predict what a real configuration produces:"),
        challenge("chal_quiz_py_rag_111"),

        h2("3. Choosing size and overlap"),
        p("There is no universal setting, but the trade-offs are predictable:"),
        bullets([
            "**Small chunks (50-150 words)** match precise questions well and keep the prompt small, but each one carries little context - answers that need two paragraphs need two hits.",
            "**Large chunks (300-800 words)** carry context, but their embedding averages many topics, so they match specific questions worse, and each hit costs more prompt tokens.",
            "**Overlap of 10-20% of the size** is the usual starting point. It costs about `overlap / (size - overlap)` extra chunks: 50 words of overlap on 200-word windows embeds a third more chunks.",
            "**Stay under the embedding model's limit** with margin: a 512-token model and 350-word chunks of English text is comfortable; the same chunks of code or Vietnamese are not.",
        ]),
        callout("info", "Measure, don't guess",
            "Chunk size is a parameter you tune with an evaluation set, not a constant you copy from a blog post. Lesson 3.2 builds the recall@k and MRR metrics that tell you whether 200/50 beats 400/80 on your own questions."),

        h2("4. The chunker"),
        p("Word windows are easy to get almost right. The rules that matter:"),
        numbered([
            "**Split on any whitespace** with `str.split()` (no argument): tabs, new lines and runs of spaces all separate words, and leading or trailing whitespace produces no empty words. Join a chunk's words with one space.",
            "**Validate the window.** `overlap >= size` would never move forward; a negative overlap would silently skip words between chunks. Both are configuration errors: raise `ValueError` at once.",
            "**Stop at the end.** The loop ends as soon as a window reaches the last word. Stepping blindly with `range(0, len(words), step)` adds a trailing chunk made only of words the previous chunk already has - a duplicate that wins retrieval ties and wastes context.",
        ]),
        code("python", `
def chunk_words(text: str, size: int, overlap: int) -> list[str]:
    # 1. validate size and overlap
    # 2. words = text.split()
    # 3. slide a window of \`size\` words, \`size - overlap\` words at a time,
    #    and stop at the window that reaches the last word
    ...`, "chunker.py"),
        p("The challenge runs your function in Python 3.14 in the code runner. Each test feeds one case as JSON on standard input; the small runner at the bottom of the file calls your function and prints the result. Use **Run** to try the sample tests - nothing is recorded until you **Submit**."),
        challenge("chal_coding_py_rag_112", "Keep a `start` index and a `while` loop: append the window, break if `start + size >= len(words)`, otherwise move `start` forward by `size - overlap`. Check the arguments before touching the text."),

        h2("5. Beyond fixed windows"),
        p("Word windows are the baseline every RAG system should beat. Common refinements, each measurable with the metrics from lesson 3.2:"),
        bullets([
            "**Structure-aware splitting:** cut at headings and paragraphs first, then apply windows inside long sections, so a chunk rarely spans two topics.",
            "**Sentence snapping:** move each boundary to the nearest sentence end, so no chunk starts or ends mid-sentence.",
            "**Metadata on every chunk:** keep the document id, title, section and position. Lesson 3.1 uses the source to build citations, and a title prepended to the chunk text often improves retrieval more than any size tweak.",
            "**Tokens instead of words:** when you know the embedding model, count with its tokenizer. The algorithm is the same - only the unit changes.",
        ]),
        callout("tip", "itertools.batched is not a chunker",
            "Python 3.12+ has itertools.batched(words, n), which yields fixed groups of n - with no overlap. It is fine for batching embedding requests, not for building chunks."),

        h2("6. Pitfalls"),
        bullets([
            "**Character windows** cut words and numbers in half; count words or tokens.",
            "**Trailing duplicate chunks** from a loop that does not stop at the end.",
            "**Unvalidated parameters:** an overlap from a config file that is larger than the size hangs the job or skips text.",
            "**Re-chunking without re-embedding:** chunk ids change when the parameters change; rebuild the index, never mix chunks from two configurations.",
            "**Losing the source:** a chunk without its document id cannot be cited, filtered or deleted when the article is updated.",
        ]),

        h2("7. Checklist"),
        bullets([
            "Chunks are measured in words or tokens, below the embedding model's limit with margin.",
            "Consecutive chunks overlap (10-20% to start), and the chunker stops at the window that reaches the end.",
            "Invalid size/overlap combinations fail fast with a clear error.",
            "Every chunk keeps its document id, title and position.",
            "Size and overlap are chosen with an evaluation set, and the whole index is rebuilt when they change.",
        ]),
    ],
});
