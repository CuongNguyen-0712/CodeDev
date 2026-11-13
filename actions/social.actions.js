'use server';

import { rateLimiters } from "@/lib/rateLimit";
import { runAction } from "@/lib/serverAction";
import { friendTargetSchema, respondSchema } from "@/lib/validation/social";
import { parseOrThrow } from "@/lib/validation/premium";
import { socialService } from "@/services/social.service";

// userId always comes from the session via runAction; the client sends only the other person's public id.
const run = (context, handler) =>
    runAction(async ({ userId }) => {
        const { friendship, user } = await handler(userId);
        return { friendship, user };
    }, { limiter: rateLimiters.friend, context });

// Each action takes the other person's public id (respond: { userId, accept }) -> { friendship, user }.
export const sendFriendRequestAction = async (input) =>
    run("sendFriendRequestAction", (userId) => socialService.sendRequest({ userId, targetId: parseOrThrow(friendTargetSchema, { userId: input }).userId }));

export const respondFriendRequestAction = async (input) =>
    run("respondFriendRequestAction", (userId) => {
        const { userId: targetId, accept } = parseOrThrow(respondSchema, input);
        return socialService.respond({ userId, targetId, accept });
    });

export const cancelFriendRequestAction = async (input) =>
    run("cancelFriendRequestAction", (userId) => socialService.cancel({ userId, targetId: parseOrThrow(friendTargetSchema, { userId: input }).userId }));

export const removeFriendAction = async (input) =>
    run("removeFriendAction", (userId) => socialService.remove({ userId, targetId: parseOrThrow(friendTargetSchema, { userId: input }).userId }));
