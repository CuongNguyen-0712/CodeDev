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
        // ctx.users are the publicIds of the minted sessions, so the receiver can answer in its own VU.
        const known = new Set(friends.map((f) => f.id).concat(session.publicId));
        const target = pick(ctx.users);
        if (!known.has(target)) client.action("sendFriendRequestAction", "/contact", [target], "sendFriendRequestAction");
    }
    client.think();
    client.get("/messages", "/messages");
    const convs = json(client.get("/api/chat/conversations?tab=all", "/api/chat/conversations"))?.items || [];
    const conv = pick(convs);
    if (conv) {
        client.get(`/api/chat/conversations/${conv.id}/messages`, "/api/chat/conversations/:id/messages");
        client.think();
        client.action("sendMessageAction", `/messages/${conv.id}`, [{
            conversationId: conv.id, clientId: uuid(), body: `load message ${Math.floor(Math.random() * 1e6)}`,
        }], "sendMessageAction");
    }
}
