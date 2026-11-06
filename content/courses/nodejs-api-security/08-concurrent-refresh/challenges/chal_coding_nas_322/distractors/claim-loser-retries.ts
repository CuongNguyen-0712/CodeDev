// @piece claim-token: Take the token before rotating it
// Compare-and-swap: only one request can move used_at from NULL to a time.
if (!(await db.markUsed(row.id, req.now))) {
    const fresh = await db.findById(row.id);
    if (!fresh || fresh.revokedAt !== null) return { status: "revoked" };
    return { status: "retry" };
}
