// @piece live-sessions: The user's live sessions, most recent first
const families = new Map<string, SessionView & { live: boolean }>();
for (const row of s.rows) {
    if (row.userId !== userId) continue;
    const live = row.usedAt === null && row.revokedAt === null;
    const view = families.get(row.familyId);
    if (!view) {
        families.set(row.familyId, { familyId: row.familyId, deviceId: row.deviceId, createdAt: row.createdAt, lastUsedAt: row.createdAt, live });
        continue;
    }
    view.createdAt = Math.min(view.createdAt, row.createdAt);
    view.lastUsedAt = Math.max(view.lastUsedAt, row.createdAt);
    view.live = view.live || live;
}
return [...families.values()]
    .filter((v) => v.live)
    .map(({ familyId, deviceId, createdAt, lastUsedAt }) => ({ familyId, deviceId, createdAt, lastUsedAt }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt || (a.familyId < b.familyId ? -1 : a.familyId > b.familyId ? 1 : 0));
