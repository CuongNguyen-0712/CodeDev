'use client'

import MessageBody from "@/components/chat/messageBody";

import { Button } from "@/components/shadcn/button";

import { LuX } from "react-icons/lu";

/** The overlay over the thread while a message is edited: the typed text as a bubble in the centre. Local UI only. */
export default function EditPreview({ original, draft, onCancel }) {
    return (
        <div onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }} className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
            <div className="flex max-h-full w-full max-w-sm flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Edit message</p>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={onCancel} aria-label="Cancel edit"><LuX aria-hidden="true" /></Button>
                </div>
                <div className="max-h-[60%] overflow-y-auto rounded-2xl bg-primary px-3 py-2 text-primary-foreground">
                    <MessageBody body={draft.trim() ? draft : original} />
                </div>
            </div>
        </div>
    );
}
