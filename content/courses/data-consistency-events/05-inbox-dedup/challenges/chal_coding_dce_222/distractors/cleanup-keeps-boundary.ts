// @piece cleanup: Delete inbox rows past the retention window
return this.db.tx((t) => {
    let removed = 0;
    for (const [id, row] of t.inbox) {
        if (now - row.processedAt > retentionMs) {
            t.inbox.delete(id);
            removed++;
        }
    }
    return removed;
});
