// @piece expected-state: Work out the expected state from the source
const progressByKey = new Map(source.progress.map((p) => [`${p.userId}:${p.courseId}`, p]));
const expectedXp = new Map<string, number>();
const expectedCerts = new Set<string>();
for (const e of source.enrollments) {
    const key = `${e.userId}:${e.courseId}`;
    const p = progressByKey.get(key);
    expectedXp.set(e.userId, (expectedXp.get(e.userId) ?? 0) + (p?.xp ?? 0));
    if (e.status !== "active") continue;
    if (p && p.totalLessons > 0 && p.completedLessons >= p.totalLessons) expectedCerts.add(key);
}
