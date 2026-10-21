// Harness: resolves CSS lengths with the learner's resolveLength(value, ctx).
// input.cases is a list of { ctx, values }. Output, one array per case: for each value the
// number of px that resolveLength returns, or "rejected" when it throws.
async function __harness(input) {
    return input.cases.map(({ ctx, values }) =>
        values.map((value) => {
            try {
                return resolveLength(value, ctx);
            } catch {
                return "rejected";
            }
        })
    );
}
