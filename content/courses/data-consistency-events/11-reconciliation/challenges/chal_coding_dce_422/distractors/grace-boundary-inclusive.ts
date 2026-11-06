// @piece last-change: When each learner and enrollment last changed
const lastByUser = new Map<string, number>();
const lastByKey = new Map<string, number>();
for (const row of [...source.enrollments, ...source.progress]) {
    const key = `${row.userId}:${row.courseId}`;
    lastByUser.set(row.userId, Math.max(lastByUser.get(row.userId) ?? -Infinity, row.updatedAt));
    lastByKey.set(key, Math.max(lastByKey.get(key) ?? -Infinity, row.updatedAt));
}
const inFlight = (last: number | undefined) => last !== undefined && opts.now - last <= opts.graceSeconds;
