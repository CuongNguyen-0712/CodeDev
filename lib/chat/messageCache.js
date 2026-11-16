import { PUSH_PREVIEW_CHARS } from "@/lib/chat/limits";

// Pure helpers over the infinite messages cache: { pages: [{ items, nextCursor }], pageParams }, items newest first.

const hasPages = (data) => Boolean(data?.pages?.length);
const mapItems = (data, fn) => ({ ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) });

// `attachments`: what the sender picked, in the MessageDto shape, so a sending or failed message shows them.
export function optimisticMessage({ clientId, body, sender, conversationId, attachments = [], replyTo = null }) {
    return {
        id: null, seq: null, clientId, conversationId, sender, body, attachments, replyTo, reactions: [],
        createdAt: new Date().toISOString(), editedAt: null, deleted: false, status: "sending",
    };
}

// Never throws: an unreadable seq compares as "not older".
export const older = (a, b) => {
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

// The quote preview of a message, by the server rule (services/chat.service.js, which the client cannot import).
const quotePreview = (m) => {
    if (m.body?.includes("```")) return "[code]";
    if (!m.body?.trim() && m.attachments?.length) return `[${m.attachments.some((a) => a.kind !== "file") ? "image" : "file"}]`;
    return [...(m.body ?? "")].slice(0, PUSH_PREVIEW_CHARS).join("");
};

/** Brings the quote (replyTo) of every cached message that quotes `message` in line with it: unsent, or its current preview. */
export function refreshQuotes(data, message) {
    if (!hasPages(data) || !message?.id) return data;
    if (!data.pages.some((p) => p.items.some((m) => m.replyTo?.id === message.id))) return data;
    const replyTo = (quote) => ({ ...quote, deleted: Boolean(message.deleted), preview: message.deleted ? null : quotePreview(message) });
    return mapItems(data, (items) => items.map((m) => (m.replyTo?.id === message.id ? { ...m, replyTo: replyTo(m.replyTo) } : m)));
}

/** Replaces the cached message with the same id (edit, recall), and the quotes of it. Never revives an unsent message; a delete always wins; between live copies an older editedAt is ignored (server clock only). */
export function patchMessage(data, message) {
    const cached = hasPages(data) && data.pages.flatMap((p) => p.items).find((m) => m.id === message.id);
    if (!cached) return refreshQuotes(data, message);   // an unloaded original: the replies that are loaded still follow it
    if (cached.deleted && !message.deleted) return data;
    if (!message.deleted && cached.editedAt && message.editedAt && new Date(message.editedAt) < new Date(cached.editedAt)) return data;
    return refreshQuotes(mapItems(data, (items) => items.map((m) => (m.id === message.id ? message : m))), message);
}

/** What the UI renders, newest first: unsent items, then server items. Drops unsent items the server already has. */
export function mergeOutbox(serverItems, outboxItems) {
    const known = new Set(serverItems.map((m) => m.clientId).filter(Boolean));
    return [...outboxItems.filter((m) => !known.has(m.clientId)), ...serverItems];
}

/** Adds or removes `userId` on one emoji of a cached message. Entries keep first-reaction order, an emptied one is dropped, and a repeated event changes nothing (same object back). */
export function patchReaction(data, { messageId, emoji, userId, added }) {
    const target = hasPages(data) && data.pages.flatMap((p) => p.items).find((m) => m.id === messageId);
    if (!target) return data;
    const reactions = target.reactions ?? [];
    const entry = reactions.find((r) => r.emoji === emoji);
    const has = Boolean(entry?.userIds.includes(userId));
    if (has === added) return data;
    let next;
    if (added) next = entry ? reactions.map((r) => (r === entry ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId] } : r)) : [...reactions, { emoji, count: 1, userIds: [userId] }];
    else {
        const userIds = entry.userIds.filter((id) => id !== userId);
        next = userIds.length ? reactions.map((r) => (r === entry ? { ...r, count: userIds.length, userIds } : r)) : reactions.filter((r) => r !== entry);
    }
    return mapItems(data, (items) => items.map((m) => (m === target ? { ...m, reactions: next } : m)));
}
