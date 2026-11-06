// @piece hidden-output: Rule 1: a hidden test's output appears
if (typeof feedback !== "string" || feedback.trim() === "") return "blocked: empty";

const text = normalise(feedback);
for (let t = 0; t < refs.tests.length; t++) {
    const expected = refs.tests[t].expected;
    if (refs.tests[t].hidden && expected.length >= MIN_OUTPUT_LENGTH && feedback.includes(expected)) {
        return `blocked: hidden-output (test ${t + 1})`;
    }
}
