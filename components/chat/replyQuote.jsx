'use client'

import { LuReply } from "react-icons/lu";

import { cn } from "@/lib/utils";

/**
 * The marker above a reply, Messenger style: a label ("You replied to Ada") and the quoted original, which
 * the reply's next piece overlaps. `mine`: the reply is mine; `replierName` and `replierId`: its sender. Renders nothing when
 * the original is gone (hard-deleted).
 */
export default function ReplyQuote({ replyTo, replierName, replierId, mine, meId, onJump }) {
    if (!replyTo) return null;
    const toMe = replyTo.senderId === meId;
    const label = mine
        ? (toMe ? "You replied to yourself" : `You replied to ${replyTo.senderName}`)
        : (toMe ? `${replierName} replied to you` : replyTo.senderId === replierId ? `${replierName} replied to their own message` : `${replierName} replied to ${replyTo.senderName}`);
    const preview = replyTo.deleted ? "Original message was unsent" : replyTo.preview;
    return (
        <>
            <p aria-hidden="true" className={cn("flex items-center gap-1 px-3 text-xs text-muted-foreground", mine ? "self-end" : "self-start")}>
                <LuReply aria-hidden="true" className="size-3" />{label}
            </p>
            <button
                type="button"
                onClick={() => onJump?.(replyTo)}
                aria-label={`Reply to ${replyTo.senderName}: ${replyTo.deleted ? "Message unsent" : preview}, go to original`}
                className="max-w-full min-w-0 rounded-2xl bg-muted px-3 pt-2 pb-4 text-left text-sm text-muted-foreground opacity-80 hover:opacity-100 dark:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                <span className={cn("line-clamp-2 break-words", replyTo.deleted && "italic")}>{preview}</span>
            </button>
        </>
    );
}
