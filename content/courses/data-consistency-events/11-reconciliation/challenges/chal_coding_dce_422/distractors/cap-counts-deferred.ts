// @piece split-apply: Split, cap and apply the fixes
const ready = candidates.filter((c) => !c.flying).map((c) => c.cmd).sort(compareCommands);
const deferred = candidates.filter((c) => c.flying).map((c) => c.cmd).sort(compareCommands);
const fixes = ready.slice(0, Math.max(0, opts.maxFixes - deferred.length));
const skippedByCap = ready.slice(opts.maxFixes);

if (!opts.dryRun) {
    for (const c of fixes) {
        if (c.op === "certificate.issue") model.certificates.set(`${c.userId}:${c.courseId}`, { userId: c.userId, courseId: c.courseId, issuedAt: opts.now });
        else if (c.op === "certificate.revoke") model.certificates.delete(`${c.userId}:${c.courseId}`);
        else if (c.op === "leaderboard.upsert") model.leaderboard.set(c.userId, c.xp);
        else model.leaderboard.delete(c.userId);
    }
}
