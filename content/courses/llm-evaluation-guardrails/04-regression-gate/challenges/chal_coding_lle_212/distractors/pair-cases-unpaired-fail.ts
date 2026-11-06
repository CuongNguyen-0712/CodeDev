// @piece pair-cases: Pair the runs and check their slices
const pairs: { slice: string; before: boolean; after: boolean }[] = [];
for (const [id, b] of base) {
    const c = cand.get(id);
    if (!c) { pairs.push({ slice: b.slice, before: b.pass, after: false }); continue; }
    if (b.slice !== c.slice) problems.push(`case ${id}: slice ${b.slice} in baseline, ${c.slice} in candidate`);
    pairs.push({ slice: b.slice, before: b.pass, after: c.pass });
}
if (problems.length > 0) return { decision: "invalid", reasons: problems };
