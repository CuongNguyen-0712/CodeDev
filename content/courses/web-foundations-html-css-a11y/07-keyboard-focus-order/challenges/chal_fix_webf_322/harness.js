// Harness: Fix the tab order audit
// Calls tabOrder() on the element tree in input.tree (plain JSON, there is no DOM in the
// worker) and returns the array of ids it computed. A throw is reported as
// "error: <message>" so it shows up in the test output instead of crashing the run.
async function __harness(input) {
    try {
        return tabOrder(input.tree);
    } catch (error) {
        return `error: ${error.message}`;
    }
}
