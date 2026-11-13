'use server';

import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import { friendTargetSchema, respondSchema } from "@/lib/validation/social";
import { parseOrThrow } from "@/lib/validation/premium";
import { socialService } from "@/services/social.service";

// userId always comes from the session via runAction; the client sends only the other person's public id.
// Each action takes the other person's public id (respond: { userId, accept }) -> { friendship, user }.
const targetOf = (input) => parseOrThrow(friendTargetSchema, { userId: input }).userId;

export async function sendFriendRequestAction(input) {
    return runAction(async ({ userId }) => {
        const { friendship, user } = await socialService.sendRequest({ userId, targetId: targetOf(input) });
        return { friendship, user };
    }, { limiter: rateLimiters.friend, context: "sendFriendRequestAction" });
}

export async function respondFriendRequestAction(input) {
    return runAction(async ({ userId }) => {
        const { userId: targetId, accept } = parseOrThrow(respondSchema, input);
        const { friendship, user } = await socialService.respond({ userId, targetId, accept });
        return { friendship, user };
    }, { limiter: rateLimiters.friend, context: "respondFriendRequestAction" });
}

export async function cancelFriendRequestAction(input) {
    return runAction(async ({ userId }) => {
        const { friendship, user } = await socialService.cancel({ userId, targetId: targetOf(input) });
        return { friendship, user };
    }, { limiter: rateLimiters.friend, context: "cancelFriendRequestAction" });
}

export async function removeFriendAction(input) {
    return runAction(async ({ userId }) => {
        const { friendship, user } = await socialService.remove({ userId, targetId: targetOf(input) });
        return { friendship, user };
    }, { limiter: rateLimiters.friend, context: "removeFriendAction" });
}
