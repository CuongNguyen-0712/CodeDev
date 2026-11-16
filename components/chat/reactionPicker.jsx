'use client'

import { useState } from "react";
import dynamic from "next/dynamic";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuPlus } from "react-icons/lu";

// frimousse and its emoji data load only when "+" is pressed.
const EmojiPicker = dynamic(() => import("@/components/shadcn/emoji-picker").then((m) => m.EmojiPicker), {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-72 max-w-[calc(100vw-2rem)]" />,
});

export const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "😡"];

/** The body of the React popover: six quick emoji and "+" for the full picker. */
export default function ReactionPicker({ onPick }) {
    const [full, setFull] = useState(false);
    if (full) return <EmojiPicker className="h-80 w-72 max-w-[calc(100vw-2rem)]" onEmojiSelect={({ emoji }) => onPick(emoji)} />;
    return (
        <div className="flex items-center gap-0.5">
            {QUICK_EMOJI.map((emoji) => (
                <Button key={emoji} type="button" variant="ghost" size="icon-sm" className="text-lg" aria-label={`React with ${emoji}`} onClick={() => onPick(emoji)}>{emoji}</Button>
            ))}
            <Button type="button" variant="ghost" size="icon-sm" aria-label="More emoji" onClick={() => setFull(true)}><LuPlus aria-hidden="true" /></Button>
        </div>
    );
}
