// @piece top-learners: Answer which learners submit the most
// "Which learners submit the most": sum the counter by user_id, highest first.
topLearners(n: number): Array<{ userId: string; count: number }> {
    const totals = new Map<string, number>();
    for (const point of this.meter.collect("codedev_submissions_total")) {
        const userId = point.attributes.user_id;
        totals.set(userId, (totals.get(userId) ?? 0) + point.value);
    }
    return [...totals]
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
        .slice(0, n);
}
