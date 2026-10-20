// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-py-rag-3-1",
    title: "Packing context under a token budget, with citations",
    slug: { _type: "slug", current: "rag-context-packing-token-budget" },
    description:
        "Long questions fail with \"context length exceeded\", and nobody can check where an answer came from. Learn how to budget the context window, pack ranked chunks greedily with per-source limits and citations, and render prompts safely with Python 3.14 template strings.",
    estimatedTime: 24,

    scenario: {
        role: "Backend engineer on the support assistant team",
        problem:
            "The assistant sends the top 20 chunks to the model for every question. Since the help center added long policy pages, 6% of requests fail with \"context length exceeded\", and the quick fix - truncating the prompt string to 60,000 characters - cut off the user's question at the end. Answers that do arrive cannot be checked: support agents see \"refunds take up to 30 days\" with no link to the article it came from, and one policy page alone sometimes fills half the context.",
    },

    content: [
        h2("1. The incident: a prompt is a budget, not a string"),
        p("Everything the model reads and writes in one call shares one **context window**: system prompt, conversation, retrieved chunks, the question - and the answer it is about to generate. Truncating the final string treats this as a formatting problem. It is an allocation problem, and the retrieved chunks are the part you control:"),
        code("text", `
chunk budget = context window
             - system prompt and instructions
             - conversation history + the question
             - formatting around the chunks
             - tokens reserved for the answer`, "budget.txt"),
        p("With a 16,000-token window, a 600-token system prompt, a 900-token conversation and 1,500 tokens reserved for the answer, about 13,000 tokens are left for chunks. Compute this per request - questions and histories vary - and pack the chunks into it in order of rank."),
        challenge("chal_quiz_py_rag_312"),

        h2("2. Greedy packing with rules"),
        p("The retriever already ranked the chunks; packing walks that list once and decides what goes in. The rules come from real failures:"),
        numbered([
            "**Count the real cost.** The cost of a chunk is the tokens of the line you add, citation marker included. In production use the model's tokenizer (for OpenAI-style models, `tiktoken`); in this lesson `count_tokens()` approximates it by counting words and punctuation marks.",
            "**Skip, don't stop.** When a chunk does not fit, later and shorter chunks may still fit. Stopping at the first overflow throws away budget you had.",
            "**Limit chunks per source.** One long policy page can produce ten highly ranked chunks. Two or three per source leave room for other documents and other points of view.",
            "**Skip repeated text.** The same paragraph exported by two tools (lesson 1.2) should not take budget twice.",
            "**Cite sources, not chunks.** Number each source document the first time it is used - `[1]`, `[2]` - and reuse the number for its other chunks. A chunk that was skipped never takes a number, so the numbers in the context are always 1, 2, 3... with no gaps.",
        ]),
        image("context-budget-packing", {
            alt: "A 16,000-token window split into system prompt, history and question, chunks and reserved answer tokens. Ranked chunks are packed into the chunk budget in order: chunk 1 from kb-refunds gets [1], chunk 2 from kb-payments is too large and is skipped without taking a number, chunk 3 from kb-cancel gets [2], chunk 4 from kb-payments fits and gets [3].",
            caption: "Pack in rank order, skip what does not fit, and number sources only when one of their chunks is actually used.",
        }),
        code("python", `
def pack_context(chunks, budget, max_per_source):
    numbers: dict[str, int] = {}          # source -> citation number
    ...
    for chunk in chunks:                  # already in rank order
        # skip repeated text and sources that reached max_per_source
        # tentative number: numbers.get(source, len(numbers) + 1)
        # line = f"[{number}] {text}", cost = count_tokens(line)
        # does not fit -> continue; fits -> commit the number, the line and the cost
        ...`, "packer.py"),
        challenge("chal_coding_py_rag_311", "Compute the number a source would get, build the line and its cost, and only then - if it fits - store the number with numbers.setdefault(). That way a skipped chunk never consumes a citation number."),

        h2("3. Rendering the prompt with t-strings"),
        p("Retrieved text is untrusted input: a help article, a forum post or a PDF can contain `</context>` or \"ignore the previous instructions\". An f-string pastes it in verbatim. Python 3.14's **template strings** (PEP 750) keep the static text and the interpolated values apart until your code renders them:"),
        code("python", `
from string.templatelib import Interpolation, Template

def render_prompt(template: Template) -> str:
    parts = []
    for item in template:                       # static strings and Interpolation objects, in order
        if isinstance(item, Interpolation):
            value = str(item.value)
            parts.append(value.replace("</context>", "&lt;/context&gt;"))
        else:
            parts.append(item)                  # the trusted, static part of the template
    return "".join(parts)

packed = pack_context(chunks, budget=13_000, max_per_source=2)
prompt = render_prompt(t"""<context>
{packed["context"]}
</context>
Answer from the context only and cite sources as [n].
Question: {question}""")`, "prompt.py"),
        bullets([
            "`t\"...\"` evaluates like an f-string but returns a `Template`; nothing is concatenated until `render_prompt` decides how each value goes in.",
            "Escaping delimiters keeps retrieved text inside its block. It does not make prompt injection impossible - keep tool permissions narrow and treat model output as untrusted too - but it removes the cheapest attack.",
            "The same template object can render differently for logging (values redacted) and for the model.",
        ]),
        callout("tip", "Return the citations with the answer",
            "Send the citations list (source ids in number order) to the client together with the model's answer. The UI can turn [2] into a link to the second source, and support agents can verify an answer in one click."),

        h2("4. Order and \"lost in the middle\""),
        p("Models use the beginning and the end of a long context better than the middle. Two cheap mitigations: keep the context small (a well-ranked 3,000 tokens often beats a padded 13,000), and keep the best chunks first. If you reorder for other reasons - for example grouping chunks by source - measure the effect with the evaluation from lesson 3.2."),

        h2("5. Pitfalls"),
        bullets([
            "**Truncating the prompt string:** the question or the instructions get cut instead of the least relevant chunk.",
            "**Forgetting the answer reserve:** the request fits, the answer is cut off mid-sentence.",
            "**Stopping at the first chunk that does not fit** instead of trying the next ones.",
            "**One source filling the context:** no per-source limit.",
            "**Citation numbers per chunk,** or numbers taken by skipped chunks, so [3] points to nothing.",
            "**f-strings for untrusted text:** retrieved content can close your delimiters.",
        ]),

        h2("6. Checklist"),
        bullets([
            "The chunk budget is computed per request: window minus instructions, history, question, formatting and answer reserve.",
            "Chunks are packed greedily in rank order with the model's tokenizer; oversized chunks are skipped, not fatal.",
            "Each source contributes at most N chunks, and repeated text is skipped.",
            "Sources are numbered in order of first use, and the citations are returned with the answer.",
            "Prompts are rendered from templates that escape retrieved text.",
        ]),
    ],
});
