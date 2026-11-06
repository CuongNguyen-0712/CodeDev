// @piece skip-invalid: Leave an invalid case out of the totals
if (problems.length > 0) {
    invalid.push(...problems);
    results.push({ id: c.id, status: "invalid", failed: [] });
    s.total++;
    weightAll += isFiniteNumber(w) && w > 0 ? w : 1;
    continue;
}
