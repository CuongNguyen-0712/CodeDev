// @piece code-overlap: Rule 2: a code block overlaps a solution
const { blocks, prose } = splitFeedback(feedback);
const blockPrints = blocks.map(fingerprint);
let best = 0;
let bestSolution = 0;
refs.solutions.forEach((solution, s) => {
    const ref = fingerprint(solution);
    if (ref.size === 0) return;
    for (const prints of blockPrints) {
        let shared = 0;
        for (const h of ref) if (prints.has(h)) shared++;
        if (prints.size > 0 && shared / prints.size > best) {
            best = shared / prints.size;
            bestSolution = s + 1;
        }
    }
});
if (best >= MAX_OVERLAP) return `blocked: code-overlap (solution ${bestSolution}, ${best.toFixed(2)})`;
