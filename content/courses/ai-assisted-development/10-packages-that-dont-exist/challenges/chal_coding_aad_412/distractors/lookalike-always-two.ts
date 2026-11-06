// @piece lookalike: Is the name close to a popular package
const n = normalize(name);
let best: { distance: number; name: string } | null = null;
for (const p of popular) {
    const np = normalize(p);
    const distance = levenshtein(n, np);
    if (distance > 2) continue;
    if (!best || distance < best.distance || (distance === best.distance && p < best.name)) best = { distance, name: p };
}
if (best) return result("lookalike", best.name);
