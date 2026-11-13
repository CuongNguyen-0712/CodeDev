import { json, pick, uuid } from "./util.js";

export default function (client, ctx, session) {
    client.get("/contact", "/contact");
    const friends = json(client.get("/api/friends", "/api/friends"))?.items || [];
    const received = json(client.get("/api/friends/invitations?direction=received", "/api/friends/invitations"))?.items || [];
    client.get("/api/friends/counts", "/api/friends/counts");
    client.think();
    if (received.length) {
        client.action("respondFriendRequestAction", "/contact", [{ userId: received[0].id, accept: true }], "respondFriendRequestAction");
    } else {
        // Not themself and not a current friend: those are refused by design (400/409), not by load.
        const known = new Set(friends.map((f) => f.id).concat(session.publicId));
        const target = pick(ctx.users);
        if (!known.has(target)) client.action("sendFriendRequestAction", "/contact", [target], "sendFriendRequestAction");
    }
    client.think();
    client.get("/messages", "/messages");
    client.get("/api/chat/conversations?tab=all", "/api/chat/conversations");
    // shortcut: seeded conversation ids lack the cnv_ prefix the API validates, so the per-conversation
    // GET and a send by conversationId are impossible; send by recipient (toUserId) instead.
    if (friends.length) {
        client.action("sendMessageAction", "/messages/new", [{
            toUserId: pick(friends).id, clientId: uuid(), body: `load message ${Math.floor(Math.random() * 1e6)}`,
        }], "sendMessageAction");
    }
}
