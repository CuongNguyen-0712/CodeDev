// Harness: audits pages with the learner's auditStructure(root).
// input.pages is a list of parsed pages; each page is a { tag, attrs, text, children } tree.
// Output, one entry per page: { outline, landmarks, issues }, or "error" when auditStructure
// throws (the contract never asks it to throw).
async function __harness(input) {
    return input.pages.map((page) => {
        try {
            const { outline, landmarks, issues } = auditStructure(page);
            return { outline, landmarks, issues };
        } catch {
            return "error";
        }
    });
}
