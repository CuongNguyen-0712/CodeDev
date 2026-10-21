// Harness: resolves the cascade with the learner's cascadeWinner(layerOrder, declarations).
// input.cases is a list of { layers, declarations }; every declaration matches the same element
// and sets the same property.
// Output, one entry per case: { index, value, specificity } from cascadeWinner, or "error" when
// it throws.
async function __harness(input) {
    return input.cases.map(({ layers, declarations }) => {
        try {
            const { index, value, specificity } = cascadeWinner(layers, declarations);
            return { index, value, specificity };
        } catch {
            return "error";
        }
    });
}
