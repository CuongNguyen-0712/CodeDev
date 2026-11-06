// @piece apply-page: Apply the page and keep its cursor, all or nothing
store.setCursor(page.nextCursor);
store.transaction((tx) => {
    for (const change of page.changes) {
        if (change.deleted) tx.remove(change.id);
        else tx.upsert(change.id, change.version, change.data);
    }
});
