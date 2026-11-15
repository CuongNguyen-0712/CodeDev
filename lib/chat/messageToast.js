/**
 * The toast for a chat-message event outside /messages (spec section 4.7), or null when none is due:
 * on /messages (the inbox shows it), in a hidden tab (web push covers it) or for my own message.
 * One toast per conversation: the id is the conversation's, so a later message replaces the earlier toast.
 * A request (toRequest: I am pending) is anonymous: no name or preview, whatever the payload carries.
 */
export function messageToast({ pathname, visible, meId, payload }) {
    const conversationId = payload?.conversationId;
    if (!conversationId || !visible || pathname?.startsWith("/messages")) return null;
    const id = `chat-toast:${conversationId}`;
    if (payload.toRequest) return { id, title: "New message request", description: undefined, href: "/messages?tab=requests" };
    if ((payload.message?.sender?.id ?? payload.senderId) === meId || !payload.title) return null;
    return { id, title: payload.title, description: payload.preview, href: `/messages/${conversationId}` };
}
