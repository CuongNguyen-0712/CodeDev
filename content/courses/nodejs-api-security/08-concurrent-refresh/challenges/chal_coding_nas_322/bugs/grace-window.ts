// @piece grace-window: A retry from the same device in the grace window
if (req.deviceId === row.deviceId && req.now - usedAt < GRACE_MS && row.replacedBy !== null) {
    const successor = await db.findById(row.replacedBy);
    const reply = await db.getReply(row.id);
    if (successor && successor.usedAt === null && successor.revokedAt === null && reply !== null) {
        return { status: "grace", token: reply };
    }
}
