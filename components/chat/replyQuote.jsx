'use client'

/** The quoted original above a reply's text. Renders nothing when the original is gone (hard-deleted). */
export default function ReplyQuote({ replyTo, onJump }) {
    if (!replyTo) return null;
    const preview = replyTo.deleted ? "Message unsent" : replyTo.preview;
    return (
        <button
            type="button"
            onClick={() => onJump?.(replyTo)}
            aria-label={`Reply to ${replyTo.senderName}: ${preview}, go to original`}
            className="flex max-w-full min-w-0 flex-col items-start rounded-2xl border px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
            <span className="max-w-full truncate font-medium text-foreground">{replyTo.senderName}</span>
            <span className={replyTo.deleted ? "line-clamp-1 italic" : "line-clamp-1"}>{preview}</span>
        </button>
    );
}
