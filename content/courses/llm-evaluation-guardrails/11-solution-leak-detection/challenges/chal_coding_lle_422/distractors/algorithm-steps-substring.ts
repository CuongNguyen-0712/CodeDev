// @piece algorithm-steps: Rule 3: the steps name distinctive identifiers
const steps = prose.filter((line) => /^([-*]|\d+\.)\s+/.test(line.trim())).join("\n");
const found = refs.distinctive.filter((id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.length > 0 && steps.includes(id);
});
const needed = Math.min(MIN_IDENTIFIERS, refs.distinctive.length);
if (needed > 0 && found.length >= needed) return `blocked: algorithm-steps (${found.join(", ")})`;
