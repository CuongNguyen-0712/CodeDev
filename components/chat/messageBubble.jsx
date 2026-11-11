'use client'

import { useState } from "react";

import { formatFileSize } from "@/lib/chat/fileInfo";
import { EDIT_WINDOW_MS, MAX_BODY } from "@/lib/chat/limits";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import FileIcon from "@/components/chat/fileIcon";
import MessageBody from "@/components/chat/messageBody";
import ReportDialog from "@/components/chat/reportDialog";
import UserAvatar from "@/components/chat/userAvatar";

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/shadcn/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Textarea } from "@/components/shadcn/textarea";

import { LuCheck, LuCheckCheck, LuDownload, LuEllipsis, LuFlag, LuPencil, LuUndo2 } from "react-icons/lu";

/** True when every other member has read up to `seq` (seqs are bigint strings, so never compared as text). */
export function seenByAll(seq, others) {
    try {
        return others.length > 0 && others.every((m) => BigInt(m.lastReadSeq ?? 0) >= BigInt(seq));
    } catch {
        return false;
    }
}

const nameOf = (user) => user?.nickname || user?.username || "Someone";

function Status({ message, others, failure, onRetry, onDiscard }) {
    if (message.status === "sending") return <span>Sending...</span>;
    if (message.status === "failed") {
        return (
            <span className="flex flex-wrap items-center justify-end gap-x-1 text-destructive">
                {failure?.message || "Not sent"}
                {failure?.retryable !== false && <Button type="button" variant="link" size="xs" onClick={() => onRetry(message)}>Retry</Button>}
                <Button type="button" variant="link" size="xs" onClick={() => onDiscard(message)}>Discard</Button>
            </span>
        );
    }
    const seen = seenByAll(message.seq, others);
    const Icon = seen ? LuCheckCheck : LuCheck;
    return (
        <span className={cn("inline-flex", seen && "text-primary-ink")}>
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{seen ? "Seen" : "Sent"}</span>
        </span>
    );
}

function EditForm({ message, onSave, onCancel }) {
    const [draft, setDraft] = useState(message.body);
    const save = (event) => {
        event.preventDefault();
        if (draft.trim() && draft !== message.body) onSave(draft);
        onCancel();
    };
    return (
        <form onSubmit={save} className="flex w-full min-w-64 flex-col gap-2">
            <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Escape") onCancel();
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        event.currentTarget.form.requestSubmit();
                    }
                }}
                maxLength={MAX_BODY}
                aria-label="Edit message"
                className="h-20 resize-none field-sizing-fixed"
                autoFocus
            />
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!draft.trim()}>Save</Button>
            </div>
        </form>
    );
}

/**
 * One message. Mine sit on the right with their send state (sending / failed / ✓ / ✓✓); `others` are the
 * other members (for ✓✓). `failure`: { message, retryable } for a failed send, when known.
 */
export default function MessageBubble({ message, mine = false, others, showSender = false, failure, onRetry, onDiscard, onEdit, onUnsend, onReport }) {
    const [editing, setEditing] = useState(false);
    const [openedAt, setOpenedAt] = useState(0);
    const [confirmUnsend, setConfirmUnsend] = useState(false);
    const [reporting, setReporting] = useState(false);

    const sent = message.seq != null && !message.deleted;
    const canEdit = mine && sent && openedAt - Date.parse(message.createdAt) < EDIT_WINDOW_MS;
    const hasMenu = sent;
    // A message without `kind` on an attachment is an image.
    const images = (message.attachments || []).filter((a) => a.kind !== "file");
    const files = (message.attachments || []).filter((a) => a.kind === "file");

    return (
        <li className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
            {!mine && <UserAvatar name={nameOf(message.sender)} image={message.sender?.image} className="size-8" />}
            <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-1 sm:max-w-[75%]", mine ? "items-end" : "items-start")}>
                {showSender && !mine && <span className="px-1 text-xs text-muted-foreground">{nameOf(message.sender)}</span>}
                <div className={cn("flex min-w-0 max-w-full items-center gap-1", mine && "flex-row-reverse")}>
                    {editing ? (
                        <EditForm message={message} onSave={(body) => onEdit(message, body)} onCancel={() => setEditing(false)} />
                    ) : message.deleted ? (
                        <p className="rounded-2xl border px-3 py-2 text-sm text-muted-foreground italic">This message was unsent</p>
                    ) : (
                        <div className={cn(
                            "flex min-w-0 flex-col gap-2 rounded-2xl px-3 py-2",
                            mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                            message.status === "sending" && "opacity-70",
                        )}>
                            {images.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {images.map((a) => (
                                        <a key={a.id} href={`/api/chat/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
                                            {/* eslint-disable-next-line @next/next/no-img-element -- the route 302s to a short-lived signed URL; previewUrl is a local blob while sending */}
                                            <img
                                                src={a.previewUrl || `/api/chat/attachments/${a.id}`}
                                                alt="Attached image"
                                                width={a.width || undefined}
                                                height={a.height || undefined}
                                                loading="lazy"
                                                className="h-auto max-h-60 w-auto max-w-full rounded-md object-cover"
                                            />
                                        </a>
                                    ))}
                                </div>
                            )}
                            {files.map((a) => (
                                <a
                                    key={a.id}
                                    href={`/api/chat/attachments/${a.id}`}
                                    download
                                    aria-label={`Download ${a.name}, ${formatFileSize(a.size)}`}
                                    className={cn("flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm", mine ? "bg-primary-foreground/10" : "bg-background")}
                                >
                                    <FileIcon name={a.name} className="size-5 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate" title={a.name}>{a.name}</span>
                                    <span className="shrink-0 text-xs tabular-nums">{formatFileSize(a.size)}</span>
                                    <LuDownload aria-hidden="true" className="size-4 shrink-0" />
                                </a>
                            ))}
                            {message.body && <MessageBody body={message.body} />}
                        </div>
                    )}
                    {hasMenu && !editing && (
                        <DropdownMenu onOpenChange={(open) => open && setOpenedAt(Date.now())}>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground data-[state=open]:bg-accent" aria-label={`More actions for ${nameOf(message.sender)}`}>
                                    <LuEllipsis />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={mine ? "end" : "start"} className="w-48">
                                {mine ? (
                                    <>
                                        {canEdit && <DropdownMenuItem onSelect={() => setEditing(true)}><LuPencil />Edit</DropdownMenuItem>}
                                        {canEdit && <DropdownMenuSeparator />}
                                        <DropdownMenuItem variant="destructive" onSelect={() => setConfirmUnsend(true)}><LuUndo2 />Unsend</DropdownMenuItem>
                                    </>
                                ) : (
                                    <DropdownMenuItem variant="destructive" onSelect={() => setReporting(true)}><LuFlag />Report</DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                    {message.createdAt && <time dateTime={message.createdAt}>{formatRelative(message.createdAt)}</time>}
                    {message.editedAt && !message.deleted && <span>edited</span>}
                    {mine && !message.deleted && <Status message={message} others={others} failure={failure} onRetry={onRetry} onDiscard={onDiscard} />}
                </p>
            </div>

            <AlertDialog open={confirmUnsend} onOpenChange={setConfirmUnsend}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unsend this message?</AlertDialogTitle>
                        <AlertDialogDescription>It is removed for everyone in this conversation, with its images.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => onUnsend(message)}>Unsend</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {!mine && <ReportDialog open={reporting} onOpenChange={setReporting} onConfirm={(reason) => onReport(message, reason)} />}
        </li>
    );
}
