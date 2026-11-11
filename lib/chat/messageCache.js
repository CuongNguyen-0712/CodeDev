// Pure helpers over the infinite messages cache: { pages: [{ items, nextCursor }], pageParams }, items newest first.

const hasPages = (data) => Boolean(data?.pages?.length);
const mapItems = (data, fn) => ({ ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) });

export function optimisticMessage({ clientId, body, sender, conversationId }) {
    return {
        id: null, seq: null, clientId, conversationId, sender, body, attachments: [],
        createdAt: new Date().toISOString(), editedAt: null, deleted: false, status: "sending",
    };
}

/** Adds `message` at the front; skips a seq already cached; replaces the optimistic copy with the same clientId. */
export function insertMessage(data, message) {
    if (!hasPages(data)) return data;
    const all = data.pages.flatMap((page) => page.items);
    if (message.seq != null && all.some((m) => m.seq === message.seq)) return data;

    const isOptimistic = (m) => m.seq == null && m.clientId && m.clientId === message.clientId;
    if (all.some(isOptimistic)) return mapItems(data, (items) => items.map((m) => (isOptimistic(m) ? message : m)));

    return { ...data, pages: data.pages.map((page, i) => (i === 0 ? { ...page, items: [message, ...page.items] } : page)) };
}

/** Replaces the cached message with the same id (edit, recall). */
export function patchMessage(data, message) {
    if (!hasPages(data) || !data.pages.some((p) => p.items.some((m) => m.id === message.id))) return data;
    return mapItems(data, (items) => items.map((m) => (m.id === message.id ? message : m)));
}

/** Sets `status` on the not-yet-confirmed message with this clientId (sending <-> failed). */
export function setMessageStatus(data, clientId, status) {
    if (!hasPages(data)) return data;
    return mapItems(data, (items) => items.map((m) => (m.seq == null && m.clientId === clientId ? { ...m, status } : m)));
}
