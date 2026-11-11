// Pure helpers over the infinite messages cache: { pages: [{ items, nextCursor }], pageParams }, items newest first.

const hasPages = (data) => Boolean(data?.pages?.length);
const mapItems = (data, fn) => ({ ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) });

// `attachments`: what the sender picked, in the MessageDto shape, so a sending or failed message shows them.
export function optimisticMessage({ clientId, body, sender, conversationId, attachments = [] }) {
    return {
        id: null, seq: null, clientId, conversationId, sender, body, attachments,
        createdAt: new Date().toISOString(), editedAt: null, deleted: false, status: "sending",
    };
}

// Never throws: an unreadable seq compares as "not older".
const older = (a, b) => {
    try {
        return BigInt(a) < BigInt(b);
    } catch {
        return false;
    }
};

/** Adds `message` by seq (newest first); skips a seq already cached. An unconfirmed copy with the same clientId is replaced (the outbox normally holds those). */
export function insertMessage(data, message) {
    if (!hasPages(data)) return data;
    const all = data.pages.flatMap((page) => page.items);
    if (message.seq != null && all.some((m) => m.seq === message.seq)) return data;

    const isOptimistic = (m) => m.seq == null && m.clientId && m.clientId === message.clientId;
    if (all.some(isOptimistic)) return mapItems(data, (items) => items.map((m) => (isOptimistic(m) ? message : m)));

    // First item older than the message; failing that, the end of the last page.
    const last = data.pages.length - 1;
    let placed = false;
    const pages = data.pages.map((page, i) => {
        if (placed) return page;
        let at = page.items.findIndex((m) => m.seq != null && older(m.seq, message.seq));
        if (at < 0 && i === last) at = page.items.length;
        if (at < 0) return page;
        placed = true;
        return { ...page, items: [...page.items.slice(0, at), message, ...page.items.slice(at)] };
    });
    return { ...data, pages };
}

/** Replaces the cached message with the same id (edit, recall). Never revives an unsent message or applies an older edit. */
export function patchMessage(data, message) {
    const cached = hasPages(data) && data.pages.flatMap((p) => p.items).find((m) => m.id === message.id);
    if (!cached) return data;
    if (cached.deleted && !message.deleted) return data;
    if (cached.editedAt && message.editedAt && new Date(message.editedAt) < new Date(cached.editedAt)) return data;
    return mapItems(data, (items) => items.map((m) => (m.id === message.id ? message : m)));
}

/** What the UI renders, newest first: unsent items, then server items. Drops unsent items the server already has. */
export function mergeOutbox(serverItems, outboxItems) {
    const known = new Set(serverItems.map((m) => m.clientId).filter(Boolean));
    return [...outboxItems.filter((m) => !known.has(m.clientId)), ...serverItems];
}
