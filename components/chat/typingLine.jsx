'use client'

import { useEffect, useMemo, useState } from "react";

import { useChatTypingStore } from "@/stores/chatTypingStore";

const nameOf = (member) => member?.nickname || member?.username || "Someone";

/** "X is typing..." under the thread. A ping lasts TYPING_SHOW_MS; a timer re-renders when the next one ends. */
export default function TypingLine({ conversationId, members = [], meId }) {
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

    const names = useMemo(() => Object.keys(entry ?? {})
        .filter((userId) => userId !== meId && entry[userId] > now)
        .map((userId) => nameOf(members.find((m) => m.id === userId))), [entry, now, meId, members]);

    const text = names.length === 0 ? ""
        : names.length === 1 ? `${names[0]} is typing...`
            : names.length === 2 ? `${names[0]} and ${names[1]} are typing...`
                : "Several people are typing...";

    // Fixed height, so the list does not jump when the line appears.
    return <p role="status" aria-live="polite" className="h-5 truncate px-1 text-xs text-muted-foreground">{text}</p>;
}
