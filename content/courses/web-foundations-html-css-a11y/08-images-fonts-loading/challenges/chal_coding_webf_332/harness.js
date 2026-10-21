// Harness: audits pages with the learner's auditImages(images, viewport).
// input.pages is a list of pages; each page is { images, viewport }.
// Output, one entry per page: the array auditImages returns ({ src, issues } per image),
// or "error" when auditImages throws.
async function __harness(input) {
    return input.pages.map(({ images, viewport }) => {
        try {
            return auditImages(images, viewport).map(({ src, issues }) => ({ src, issues }));
        } catch {
            return "error";
        }
    });
}
