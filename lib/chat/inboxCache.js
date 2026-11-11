// Pure edits of an inbox infinite-query cache ({ pages: [{ items, nextCursor }] }). Inputs are never mutated;
// when nothing changes the same `data` reference comes back so setQueryData skips the notify.

const locate = (data, id) => {
    for (let p = 0; p < (data?.pages?.length ?? 0); p++) {
        const i = data.pages[p].items.findIndex((row) => row.id === id);
        if (i >= 0) return { p, i, row: data.pages[p].items[i] };
    }
    return null;
};

const newer = (a, b) => {
    try {
        return BigInt(a) > BigInt(b);
    } catch {
        return false;
    }
};

// Replaces the row in place, or lifts it to the top of the first page.
const withRow = (data, { p, i }, row, toTop) => {
    const pages = data.pages.map((page, n) => {
        if (n !== p) return page;
        return toTop
            ? { ...page, items: page.items.filter((_, k) => k !== i) }
            : { ...page, items: page.items.map((r, k) => (k === i ? row : r)) };
    });
    if (toTop) pages[0] = { ...pages[0], items: [row, ...pages[0].items] };
    return { ...data, pages };
};

/** A message arrived: lift the cached row to the top with the new preview. Never invents a row. */
export function applyIncoming(data, { conversationId, seq, preview, senderId, createdAt }, { meId, openId }) {
    const at = locate(data, conversationId);
    if (!at) return { data, found: false, becameUnread: false };
    const last = at.row.lastMessage;
    // A redelivered or older event must not rewind the row.
    if (last && !newer(seq, last.seq)) return { data, found: true, becameUnread: false };
    const unread = at.row.unread || (senderId !== meId && conversationId !== openId);
    const row = { ...at.row, lastMessage: { seq, preview, senderId, createdAt }, lastMessageAt: createdAt, unread };
    return { data: withRow(data, at, row, true), found: true, becameUnread: unread && !at.row.unread };
}

export function markRowRead(data, conversationId) {
    const at = locate(data, conversationId);
    if (!at?.row.unread) return { data, wasUnread: false };
    return { data: withRow(data, at, { ...at.row, unread: false }, false), wasUnread: true };
}

/** An edit or unsend of the newest message changes the preview only; an older message leaves the row alone. */
export function patchRowPreview(data, conversationId, { seq, preview }) {
    const at = locate(data, conversationId);
    const last = at?.row.lastMessage;
    if (!last || String(last.seq) !== String(seq) || last.preview === preview) return data;
    return withRow(data, at, { ...at.row, lastMessage: { ...last, preview } }, false);
}
