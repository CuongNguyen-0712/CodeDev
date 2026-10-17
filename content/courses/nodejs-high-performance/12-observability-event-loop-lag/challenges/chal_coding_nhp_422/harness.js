// Harness: Nearest-rank percentile
// Computes several percentiles over the same samples and checks the input array was
// not modified. Output: { results: [one value per requested p], inputUnchanged }
async function __harness(input) {
    const original = Array.isArray(input.values) ? input.values : [];
    const values = original.slice();
    const results = (input.ps || []).map((p) => {
        const value = percentile(values, p);
        return value === undefined ? "undefined" : value;
    });
    return {
        results,
        inputUnchanged: values.length === original.length && values.every((v, i) => v === original[i]),
    };
}
