// @piece grace-reply: A retry that may get the same answer again
const usedAt = row.usedAt ?? req.now;
if (req.now - usedAt < GRACE_MS && row.replacedBy !== null) {
    const successor = store.findById(row.replacedBy);
    const reply = store.getReply(row.id);
    if (successor && successor.usedAt === null && successor.revokedAt === null && reply !== null) {
        return { status: "grace", token: reply };
    }
}
