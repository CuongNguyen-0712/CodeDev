// @piece apply-page: Apply the page and keep its cursor, all or nothing
store.transaction((tx) => {
    for (const change of page.changes) tx.upsert(change.id, change.version, change.data);
    tx.setCursor(page.nextCursor);
});
