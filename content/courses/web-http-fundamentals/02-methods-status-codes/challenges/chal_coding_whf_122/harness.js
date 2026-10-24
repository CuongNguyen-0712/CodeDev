// Harness: runs the learner's chooseResponse(operation) on every operation in input.operations.
// Output, one entry per operation: { method, status } when it returns, "rejected" when it throws.
async function __harness(input) {
    return input.operations.map((operation) => {
        try {
            const { method, status } = chooseResponse(operation);
            return { method, status };
        } catch {
            return "rejected";
        }
    });
}
