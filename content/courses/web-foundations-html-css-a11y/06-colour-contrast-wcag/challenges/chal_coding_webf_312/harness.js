// Harness: runs the learner's contrastReport(foreground, background, options) on a list of checks.
// input.checks is a list of { fg, bg, sizePx, bold, kind }.
// Output, one entry per check: { ratio, large, aa, aaa } when the check is valid, "rejected" when
// contrastReport throws.
async function __harness(input) {
    return input.checks.map(({ fg, bg, sizePx, bold, kind }) => {
        try {
            const { ratio, large, aa, aaa } = contrastReport(fg, bg, { sizePx, bold, kind });
            return { ratio, large, aa, aaa };
        } catch {
            return "rejected";
        }
    });
}
