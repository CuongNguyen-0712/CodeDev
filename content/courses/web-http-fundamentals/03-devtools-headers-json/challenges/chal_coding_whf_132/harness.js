// Harness: runs the learner's classifyResponse(result) on every entry of input.results.
// Output, one entry per result: the returned value, or "threw" when the function throws.
async function __harness(input) {
    return input.results.map((result) => {
        try {
            return classifyResponse(result);
        } catch {
            return "threw";
        }
    });
}
