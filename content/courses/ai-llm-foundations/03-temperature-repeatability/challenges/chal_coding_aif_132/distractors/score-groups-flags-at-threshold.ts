// @piece score-groups: Agreement and the flag for each group
const results: StabilityRow[] = [];
for (const { prompt, temperature, counts } of groups.values()) {
    let total = 0;
    let top = 0;
    for (const n of counts.values()) {
        total += n;
        top = Math.max(top, n);
    }
    const share = top / total;
    results.push({
        prompt,
        temperature,
        runs: total,
        distinct: counts.size,
        agreement: Math.round(share * 100) / 100,
        flagged: share <= threshold,
    });
}
