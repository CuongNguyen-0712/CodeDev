// @piece hidden-output: Rule 1: a hidden test's output appears
if (typeof feedback !== "string" || feedback.trim() === "") return "blocked: empty";

const text = normalise(feedback);
for (let t = 0; t < refs.tests.length; t++) {
    const expected = normalise(refs.tests[t].expected);
    if (expected.length >= MIN_OUTPUT_LENGTH && text.includes(expected)) {
        return `blocked: hidden-output (test ${t + 1})`;
    }
}
