// Harness: sizes grids with the learner's gridColumns({ template, width, gap, items }).
// input.grids is a list of grids; each grid is { template, width, gap, items }.
// Output, one entry per grid: the array of column widths, or "error" when gridColumns throws.
async function __harness(input) {
    return input.grids.map((grid) => {
        try {
            return gridColumns({ ...grid });
        } catch {
            return "error";
        }
    });
}
