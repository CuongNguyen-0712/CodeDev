'use client'

import { useEffect, useMemo, useState } from "react";

import { useChatTypingStore } from "@/stores/chatTypingStore";

import UserAvatar from "@/components/chat/userAvatar";
import { cn } from "@/lib/utils";

const nameOf = (member) => member?.nickname || member?.username || "Someone";

// Up to three typers' avatars, overlapped, each bobbing a beat after the one before; "+N" for the rest.
// The ring in the surface colour cuts each avatar out of the one under it.
function TypingAvatars({ typers, size, ring }) {
    const shown = typers.slice(0, 3);
    const extra = typers.length - shown.length;
    return (
        <span className="flex shrink-0 -space-x-2">
            {shown.map((typer, i) => (
                <span key={typer.id} className={cn("animate-typing-avatar rounded-full ring-2", ring)} style={{ animationDelay: `${i * 180}ms` }}>
                    <UserAvatar name={nameOf(typer)} image={typer.image} className={size} />
                </span>
            ))}
            {extra > 0 && (
                <span className={cn("flex items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 tabular-nums", size, ring)}>
                    +{extra}
                </span>
            )}
        </span>
    );
}

const Dots = () => [0, 1, 2].map((i) => (
    <span key={i} className="animate-typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 160}ms` }} />
));

/**
 * "Someone is typing" as a bubble at the end of the thread: the typer's avatar and three bouncing dots.
 * A ping lasts TYPING_SHOW_MS; a timer re-renders when the next one ends. `onShow` runs when the bubble
 * appears, so the list can keep the reader at the bottom. Scrolled up, the list renders it twice: this one with
 * `bubble={false}` (the one live region stays here) and a `floating` bar above the composer (sight only).
 */
export default function TypingLine({ conversationId, members = [], meId, onShow, bubble = true, floating = false }) {
    // The entry object itself: a stable reference until a ping changes it (a filtered array would re-render forever).
    const entry = useChatTypingStore((s) => s.byConversation[conversationId]);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const current = Date.now();
        const ends = Object.values(entry ?? {}).filter((at) => at > current);
        if (!ends.length) return;
        const timer = setTimeout(() => setNow(Date.now()), Math.min(...ends) - current + 20);
        return () => clearTimeout(timer);
    }, [entry, now]);

    const typers = useMemo(() => Object.keys(entry ?? {})
        .filter((userId) => userId !== meId && entry[userId] > now)
        .map((userId) => members.find((m) => m.id === userId) ?? { id: userId }), [entry, now, meId, members]);

    const names = typers.map(nameOf);
    const text = names.length === 0 ? ""
        : names.length === 1 ? `${names[0]} is typing`
            : names.length === 2 ? `${names[0]} and ${names[1]} are typing`
                : "Several people are typing";

    const visible = typers.length > 0;
    useEffect(() => { if (visible && bubble && !floating) onShow?.(); }, [visible, bubble, floating, onShow]);

    if (floating) {
        return visible && (
            <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-4rem)] items-center gap-2 rounded-full border bg-popover py-1 pr-3 pl-1 text-xs text-foreground/80 shadow-md" aria-hidden="true">
                <TypingAvatars typers={typers} size="size-6" ring="ring-popover" />
                <span className="flex items-center gap-0.5"><Dots /></span>
                <span className="truncate">{text}</span>
            </div>
        );
    }

    return (
        // pb-4 is the thread's bottom gap: an overflow flex column drops its own padding-bottom from the scroll range.
        <div className="pb-4">
            <p role="status" aria-live="polite" className="sr-only">{text}</p>
            {visible && bubble && (
                // Same column as the messages: avatars where a message's avatar sits, the dots where its bubble does.
                <div className="flex items-end gap-2 pt-4" aria-hidden="true">
                    <TypingAvatars typers={typers} size="size-8" ring="ring-card" />
                    <div className="flex items-center gap-1 rounded-2xl bg-muted px-3.5 py-3 dark:bg-accent">
                        <Dots />
                    </div>
                </div>
            )}
        </div>
    );
}
