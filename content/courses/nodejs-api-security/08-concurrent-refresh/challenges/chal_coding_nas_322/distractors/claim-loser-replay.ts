// @piece claim-token: Take the token before rotating it
// Compare-and-swap: only one request can move used_at from NULL to a time.
if (!(await db.markUsed(row.id, req.now))) {
    const fresh = await db.findById(row.id);
    if (!fresh || fresh.revokedAt !== null) return { status: "revoked" };
    await db.revokeFamily(row.familyId, req.now);
    await db.recordEvent({ type: "refresh_token_reuse", userId: row.userId, familyId: row.familyId, tokenId: row.id, deviceId: req.deviceId, at: req.now });
    return { status: "replay_detected" };
}
