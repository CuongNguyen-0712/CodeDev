// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-ailf-1-1",
    title: "How an LLM writes text: tokens & next-token prediction",
    slug: { _type: "slug", current: "tokens-next-token-prediction" },
    description:
        "The first AI Hint prototype on CodeDev was slow for long hints and once recommended a helper function that does not exist. Both behaviours follow from how a large language model writes: it splits text into tokens and produces the answer one token at a time, each time choosing a likely next token from a probability distribution. Learn what a token is, how the generation loop works, and what that means for speed, cost and trust.",
    estimatedTime: 18,

    scenario: {
        role: "Developer on the CodeDev platform team, first AI feature",
        problem:
            "The platform team is adding an AI Hint button to the coding editor: a learner who is stuck clicks it, and a model writes a short hint from the challenge description and the learner's code. The first prototype works, but the demo raised three questions nobody on the team could answer. Why does a hint of three sentences appear almost at once while a long hint takes six seconds? Why does the provider bill in \"tokens\" instead of requests or words? And why did one hint tell a learner to call isValidSubmission() from lib/grading.js, when no such function or file exists anywhere in CodeDev?",
    },

    content: [
        h2("1. The demo that raised three questions"),
        p("The prototype sends one request per click. The request contains a short instruction, the challenge description and the learner's code; the response is the hint. During the demo the team clicked the button on two challenges and wrote down what happened:"),
        code("text", `
challenge                 hint shown to the learner                         time
------------------------  ------------------------------------------------  -----
sum-of-array (short)      "Check the loop bound: your loop visits one        1.1 s
                           index past the end of the array."
average-score (long)      a 6-paragraph explanation with two code samples   6.0 s
grade-submission          "Call isValidSubmission() from lib/grading.js      1.4 s
                           before you compute the score."`, "demo-notes.txt"),
        p("The third hint is the worrying one. It is fluent, specific and sounds like it came from someone who read the CodeDev repository. Nobody did: the model was never given the repository, and the function does not exist. To build AI features you can trust, you first need a working picture of how the model produced each of these answers. That picture has two parts: **tokens** and **next-token prediction**."),

        h2("2. Tokens: the unit a model reads and writes"),
        p("A language model does not see characters or words. Before your text reaches the model, a **tokenizer** cuts it into pieces called **tokens** and replaces each piece with a number, its id in a fixed vocabulary of tens of thousands of entries. A token is often a whole common word with its leading space, sometimes a part of a word, a punctuation mark or a run of spaces. The model reads a list of token ids and writes a list of token ids; the tokenizer turns those ids back into text for you."),
        p("Here is how a tokenizer might split the first hint. The split and the ids are illustrative - every model family uses its own tokenizer, so the exact pieces differ:"),
        code("text", `
text:    "Check the loop bound"
tokens:  ["Check", " the", " loop", " bound"]
ids:     [ 4061,    279,    6471,   6965 ]      (illustrative ids)

text:    "for (let i = 0; i <= arr.length; i++)"
tokens:  ["for", " (", "let", " i", " =", " ", "0", ";", " i", " <=",
          " arr", ".length", ";", " i", "++", ")"]                  16 tokens for 37 characters`, "tokenizer-example.txt"),
        p("Notice two things. Common English words with a leading space are usually one token each. Code is different: operators, punctuation and short identifiers each take a token, so code usually needs more tokens per character than prose. Text in other languages often needs more tokens too: a Vietnamese sentence with diacritics is typically split into more, smaller pieces than an English sentence of the same meaning."),
        callout("info", "A rule of thumb, not a law",
            "For ordinary English text, one token is on average about 4 characters, or about 0.75 words (100 tokens is roughly 75 words). Use it for rough estimates only. It varies by tokenizer and by language: Vietnamese text and source code usually need more tokens per word. When the number matters - a cost estimate, a context limit - count with the model's own tokenizer or read the token counts the API returns."),
        p("Why should a developer care about tokens? Because almost every limit and price you will meet is counted in them:"),
        bullets([
            "**Cost:** providers charge per token, with separate prices for the tokens you send (input) and the tokens the model writes (output). Lesson 2 turns this into a formula.",
            "**Size limits:** the context window, the maximum number of tokens a model can consider in one request, includes your instructions, the conversation, any documents and the answer. Lesson 3 is about what happens when you exceed it.",
            "**Speed:** the time to generate an answer grows with the number of output tokens, for reasons the next section explains.",
        ]),

        h2("3. Next-token prediction: the generation loop"),
        p("A trained language model is, at its core, a function with one job: given a list of tokens, compute a **probability for every token in the vocabulary** to be the next one. It does not produce a whole answer in one step. Generation is a loop around that function:"),
        numbered([
            "Tokenize the input (instructions, challenge, learner code) into a list of tokens.",
            "Run the model on the whole list. It returns a probability distribution over the vocabulary for the next token.",
            "Choose one token from that distribution (lesson 4 covers how: always the most likely one, or a weighted random pick).",
            "Append the chosen token to the list and stream it to the user if streaming is on.",
            "Repeat from step 2 with the longer list, until the model chooses a special end-of-text token or the request's maximum output length is reached.",
        ]),
        image("next-token-loop", {
            alt: "Diagram of the generation loop. At the top, the hint text \"Check the loop bound\" is split into four token boxes: Check, space the, space loop, space bound, each with an illustrative numeric id. In the middle, a loop: the token list so far goes into the model, the model returns a probability table for the next token (space bound 0.62, space condition 0.21, space index 0.09, space counter 0.05, space end 0.03), one token is chosen, appended to the list, and the loop runs again until an end token or the output limit. At the bottom, three consequences: output length costs time because there is one model step per output token; the model predicts likely text and does not look facts up; prices and limits are counted in tokens.",
            caption: "One model step per output token: score every candidate, pick one, append it, repeat.",
        }),
        p("Take the first demo hint. The input ended with the learner's code and the instruction to give a short hint. The model has already written \"Your loop runs one time too many. Check the loop\". For the next position it might assign probabilities like these (a toy table with five candidates; a real model scores every token in its vocabulary):"),
        code("text", `
context so far:  "... Your loop runs one time too many. Check the loop"

candidate next token   probability
" bound"               0.62
" condition"           0.21
" index"               0.09
" counter"             0.05
" end"                 0.03`, "toy-next-token-table.txt"),
        p("You can simulate the loop with a toy model: a table that maps the last token to a distribution, and a picker that always takes the most likely candidate. It runs in the browser console or Node.js:"),
        code("javascript", `
// A toy "model": for each previous token, the probabilities of the next one.
// A real model looks at ALL previous tokens and scores its whole vocabulary.
const toyModel = {
    "Check":      { " the": 0.81, " your": 0.12, " that": 0.07 },
    " the":       { " loop": 0.58, " array": 0.27, " index": 0.15 },
    " loop":      { " bound": 0.62, " condition": 0.21, " index": 0.09, " counter": 0.05, " end": 0.03 },
    " bound":     { ".": 0.70, ":": 0.22, " again": 0.08 },
    ".":          { "<end>": 1.0 },
};

function mostLikely(distribution) {
    return Object.entries(distribution).sort((a, b) => b[1] - a[1])[0][0];
}

function generate(promptTokens, maxOutputTokens) {
    const tokens = [...promptTokens];
    const output = [];
    for (let step = 0; step < maxOutputTokens; step++) {
        const next = mostLikely(toyModel[tokens[tokens.length - 1]]);  // one model step
        if (next === "<end>") break;                                    // the model chose to stop
        tokens.push(next);
        output.push(next);
    }
    return output;
}

console.log(generate(["Check"], 10).join(""));  // " the loop bound."
console.log(generate(["Check"], 2).join(""));   // " the loop"  - cut off by the output limit`, "toy-generate.js"),
        p("The toy model is tiny, but the loop is the real one. Two lessons follow directly from it."),

        h3("Output length costs time"),
        p("The model reads the input in one pass: all input tokens are processed together, which modern hardware does efficiently. The output is different. Each output token needs its own model step, and step 5 cannot start before step 4 has chosen its token. A hint of 40 tokens needs 40 sequential steps; a six-paragraph answer of 400 tokens needs 400. That is why the long demo hint took six seconds while the short one took about one, even though the inputs were almost the same size. Asking for shorter answers (\"at most 3 sentences\") and setting a maximum output length are the cheapest speed-ups you have. Lesson 2 turns this into a latency estimate."),

        h3("The model does not look things up"),
        p("Nothing in the loop searches a database, reads a file or checks a fact. At every step the model picks a token that is **likely** given the text so far, based on patterns learned from its training data and on what is in the prompt. For the grade-submission challenge, \"Call isValidSubmission() from lib/grading.js\" is an extremely likely-looking sentence: code bases are full of validation helpers with names like that, in files with names like that. Likely is not the same as true. The model had no access to CodeDev's repository, so the name was invented by the same mechanism that writes every correct hint."),
        p("This is the root of hallucination, which lessons 5 to 7 cover in depth. The fix is never \"ask the model to be more careful\". If an answer must be correct about your system, your application has to put the relevant facts into the prompt (grounding, lesson 6) or give the model a tool that really looks them up, and then check the result."),
        challenge("chal_quiz_ailf_111"),

        h2("4. When an LLM is the wrong tool"),
        p("Next-token prediction is very good at producing fluent, helpful text from a description of a situation: a hint, an explanation in simpler words, a summary of an error message. It is the wrong tool whenever the answer must be exact and can be computed:"),
        bullets([
            "**Grading.** Whether a submission passes is decided by running tests, not by asking a model whether the code \"looks correct\".",
            "**Arithmetic and counting.** Points, EXP, progress percentages and leaderboard ranks come from code and SQL. A model generates digits as tokens and can produce a plausible wrong number.",
            "**Facts about your own system.** Which lessons a learner finished, whether a function exists, what an API accepts - read them from the database, the repository or the docs.",
            "**Spelling-level tasks.** Because the model sees tokens, not letters, questions like \"how many times does the letter r appear\" are unreliable; `str.split(\"r\").length - 1` is not.",
        ]),
        p("A good AI feature usually combines both: code decides the facts (the failing test, the expected output, the line number), and the model only turns those facts into words for the learner."),

        h2("5. How to verify what you just learned"),
        bullets([
            "**Count tokens instead of guessing.** Most providers offer a tokenizer tool or a token-counting endpoint, and every API response includes a usage object with the number of input and output tokens (the field names differ by provider). Log those two numbers for every call from day one.",
            "**Measure time against output tokens.** Log the total response time with the output token count. Plot or sort them: time grows roughly in proportion to output tokens, while input size has a much smaller effect.",
            "**Check every name the model mentions.** For the AI Hint, search the challenge files and the learner's code for every function, file and API the hint names. A name that appears nowhere in the prompt was generated, not quoted.",
            "**Compare languages.** Tokenize the same hint in English and in Vietnamese. The token counts differ, and so will the cost and the length limits.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Treating tokens as words.** Estimating cost or limits with a word count. Spot it: an estimate with no tokenizer and no usage data behind it, often off for code and non-English text.",
            "**Assuming the model read your code base.** Trusting a hint because it names a specific file or function. Spot it: the named thing does not appear in the prompt you sent.",
            "**Asking for long answers by default.** Prompts without a length instruction or output limit, then complaining about latency. Spot it: average output tokens per call far above what the UI shows.",
            "**Using the model for exact answers.** Letting it compute scores or count things. Spot it: numbers in AI output that no code path computed.",
            "**Believing confidence means correctness.** Fluent, specific text is what the loop produces by design, for right and wrong answers alike. Spot it: no source, no test and no lookup behind a specific claim.",
        ]),

        h2("7. Summary"),
        bullets([
            "Text is split into tokens by a tokenizer; models read and write token ids. About 4 characters or 0.75 words per token for English text, more tokens per word for Vietnamese and code.",
            "Generation is a loop: score every possible next token, choose one, append it, repeat until an end token or the output limit.",
            "Each output token is a sequential step, so long answers are slow; ask for short answers and set an output limit.",
            "The model produces likely text, not looked-up facts. Anything that must be true about your system has to come from the prompt or a real lookup, and must be checked.",
            "Prices, context limits and speed are all counted in tokens - lessons 2 and 3 build on that.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAI Help Center: What are tokens and how to count them - help.openai.com",
            "Anthropic documentation: token counting and context windows - docs.anthropic.com",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Open the tokenizer tool or token-counting endpoint of a provider you use and tokenize three texts: a one-sentence hint in English, the same hint in Vietnamese, and a 10-line JavaScript function. Write down the characters per token for each. Then send the same prompt twice to a real model, once asking for \"at most 2 sentences\" and once with no length instruction, and compare the output token counts and response times from the API's usage data."),
    ],
});
