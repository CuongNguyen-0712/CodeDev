// @piece revoke-and-deny: Revoke its rows and deny its access tokens
let changed = 0;
for (const row of family) {
    if (row.revokedAt === null) {
        row.revokedAt = now;
        changed++;
    }
}
if (changed > 0) s.deniedFamilies.set(familyId, now + REFRESH_TTL_MS);
