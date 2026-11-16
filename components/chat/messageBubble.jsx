'use client'

import { useRef, useState } from "react";

import { formatFileSize } from "@/lib/chat/fileInfo";
import { EDIT_WINDOW_MS, MAX_BODY } from "@/lib/chat/limits";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import FileIcon from "@/components/chat/fileIcon";
import MessageBody from "@/components/chat/messageBody";
import ReactionPicker from "@/components/chat/reactionPicker";
import ReplyQuote from "@/components/chat/replyQuote";
import ReportDialog from "@/components/chat/reportDialog";
import UserAvatar from "@/components/chat/userAvatar";
import { showAlert } from "@/components/ui/alert";
import ImageLightbox from "@/components/ui/imageLightbox";

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/shadcn/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Textarea } from "@/components/shadcn/textarea";

import { LuCheck, LuCheckCheck, LuCopy, LuDownload, LuEllipsis, LuFlag, LuPencil, LuReply, LuSmilePlus, LuUndo2 } from "react-icons/lu";

/** True when every other member has read up to `seq` (seqs are bigint strings, so never compared as text). */
export function seenByAll(seq, others) {
    try {
        return others.length > 0 && others.every((m) => BigInt(m.lastReadSeq ?? 0) >= BigInt(seq));
    } catch {
        return false;
    }
}

// Quick actions show on hover or focus on desktop; touch uses the ⋯ menu.
const QUICK = "shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 focus-visible:opacity-100 max-md:hidden";
const CHIP = "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium tabular-nums transition-colors";

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
 * other members (for ✓✓). `failure`: { message, retryable } for a failed send, when known. Reply shows when
 * `onReply` is given; React and the chips toggle only when `canReact` (an accepted member); `flash` rings
 * the message after a jump to it.
 */
export default function MessageBubble({ message, mine = false, meId, others, showSender = false, groupStart = true, groupEnd = true, failure, canReact = false, flash = false, onRetry, onDiscard, onEdit, onUnsend, onReport, onReply, onReact, onJump }) {
    const [editing, setEditing] = useState(false);
    const [openedAt, setOpenedAt] = useState(0);
    const [confirmUnsend, setConfirmUnsend] = useState(false);
    const [reporting, setReporting] = useState(false);
    const [reacting, setReacting] = useState(false);
    const afterMenu = useRef(null);   // "react" | "reply": what the chosen item does once the menu has closed, so its focus return does not undo it

    const sent = message.seq != null && !message.deleted;
    const canEdit = mine && sent && openedAt - Date.parse(message.createdAt) < EDIT_WINDOW_MS;
    const hasMenu = sent;
    const unsent = message.seq == null;
    // A message without `kind` on an attachment is an image.
    const images = (message.attachments || []).filter((a) => a.kind !== "file");
    const files = (message.attachments || []).filter((a) => a.kind === "file");
    // An unsent image shows its local blob preview; a sent one opens through the attachment route (also its original).
    const gallery = images.map((a, index) => {
        const alt = images.length > 1 ? `Attached image ${index + 1} of ${images.length}` : "Attached image";
        return unsent ? { src: a.previewUrl, alt } : { src: `/api/chat/attachments/${a.id}`, alt, original: `/api/chat/attachments/${a.id}` };
    });
    const copy = () => navigator.clipboard.writeText(message.body).then(
        () => showAlert(200, "Copied"),
        () => showAlert(500, "Could not copy the message."),
    );

    return (
        // A group (messageGroups.js) shows the name once at its top and the avatar and time once at its foot;
        // the avatar sits beside the last bubble, not beside the time under it. Name and time line up with the
        // bubble's text: 32px avatar + 8px gap + the bubble's 12px padding = pl-13.
        <li data-message-id={message.id ?? undefined} data-flash={flash || undefined} tabIndex={-1} className={cn("group/msg flex flex-col outline-none", mine ? "items-end" : "items-start", groupStart ? "mt-4 first:mt-0" : "mt-0.5")}>
            {showSender && !mine && groupStart && <span className="mb-1 pl-13 text-xs text-muted-foreground">{nameOf(message.sender)}</span>}
            <div className={cn("flex w-full items-end gap-2", mine && "flex-row-reverse")}>
                {!mine && (groupEnd
                    ? <UserAvatar name={nameOf(message.sender)} image={message.sender?.image} className="size-8" />
                    : <span aria-hidden="true" className="size-8 shrink-0" />)}
                <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-1 rounded-2xl transition-shadow motion-reduce:transition-none group-data-[flash]/msg:ring-2 group-data-[flash]/msg:ring-ring group-data-[flash]/msg:ring-offset-2 group-data-[flash]/msg:ring-offset-background sm:max-w-[75%]", mine ? "items-end" : "items-start")}>
                    <Popover open={reacting} onOpenChange={setReacting}>
                    <PopoverAnchor asChild>
                    <div className={cn("flex min-w-0 max-w-full items-center gap-1", mine && "flex-row-reverse")}>
                        {editing ? (
                            <EditForm message={message} onSave={(body) => onEdit(message, body)} onCancel={() => setEditing(false)} />
                        ) : message.deleted ? (
                            <p className="rounded-2xl border px-3 py-2 text-sm text-muted-foreground italic">This message was unsent</p>
                        ) : (
                            // Images, files and text are separate pieces, like other messengers: only text sits in a coloured bubble.
                            <div className={cn("flex min-w-0 max-w-full flex-col gap-1", mine ? "items-end" : "items-start", message.status === "sending" && "opacity-70")}>
                                <ReplyQuote replyTo={message.replyTo} onJump={onJump} />
                                {images.length > 0 && (
                                    <div className={cn("overflow-hidden rounded-2xl", images.length > 1 && "grid w-64 max-w-full grid-cols-2 gap-0.5")}>
                                        {images.map((a, index) => {
                                            const tile = images.length > 1 && "block aspect-square odd:last:col-span-2 odd:last:aspect-[2/1]";
                                            const img = (
                                                // eslint-disable-next-line @next/next/no-img-element -- the route 302s to a short-lived signed URL; previewUrl is a local blob while sending
                                                <img
                                                    src={gallery[index].src}
                                                    alt={gallery[index].alt}
                                                    width={a.width || undefined}
                                                    height={a.height || undefined}
                                                    loading="lazy"
                                                    className={images.length > 1 ? "size-full bg-muted object-cover" : "h-auto max-h-72 w-auto max-w-full bg-muted object-cover"}
                                                />
                                            );
                                            // Unsent images open their blob preview; the original link is only offered once the send claimed the attachment.
                                            return (
                                                <ImageLightbox key={a.id} images={gallery} index={index} label="View image" className={cn("block focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring", tile)}>{img}</ImageLightbox>
                                            );
                                        })}
                                    </div>
                                )}
                                {files.map((a) => {
                                    const size = formatFileSize(a.size);
                                    const card = cn(
                                        "flex w-64 max-w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm",
                                        mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                                        !unsent && (mine ? "hover:bg-primary/90" : "hover:bg-muted/70"),
                                        !unsent && "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                    );
                                    const inner = (
                                        <>
                                            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", mine ? "bg-primary-foreground/15" : "bg-background")}>
                                                <FileIcon name={a.name} className="size-4" />
                                            </span>
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate font-medium" title={a.name}>{a.name}</span>
                                                <span className="text-xs tabular-nums opacity-80">{size}</span>
                                            </span>
                                            {!unsent && <LuDownload aria-hidden="true" className="size-4 shrink-0 opacity-80" />}
                                        </>
                                    );
                                    // Same look, no link, until the message is sent (the route answers 404 before that).
                                    return unsent
                                        ? <div key={a.id} role="group" aria-disabled="true" aria-label={`${a.name}, ${size}, not sent yet`} className={card}>{inner}</div>
                                        : <a key={a.id} href={`/api/chat/attachments/${a.id}`} download aria-label={`Download ${a.name}, ${size}`} className={card}>{inner}</a>;
                                })}
                                {message.body && (
                                    // dark:bg-accent: muted is almost the card colour in dark mode, so the bubble disappeared.
                                    <div className={cn("min-w-0 max-w-full rounded-2xl px-3 py-2", mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground dark:bg-accent")}>
                                        <MessageBody body={message.body} />
                                    </div>
                                )}
                            </div>
                        )}
                        {hasMenu && !editing && onReply && (
                            <Button type="button" size="icon-sm" variant="ghost" onClick={() => onReply(message)} aria-label="Reply to message" className={QUICK}><LuReply aria-hidden="true" /></Button>
                        )}
                        {hasMenu && !editing && canReact && (
                            <PopoverTrigger asChild>
                                <Button type="button" size="icon-sm" variant="ghost" aria-label="React to message" className={QUICK}><LuSmilePlus aria-hidden="true" /></Button>
                            </PopoverTrigger>
                        )}
                        {hasMenu && !editing && (
                            <DropdownMenu onOpenChange={(open) => open && setOpenedAt(Date.now())}>
                                {/* The trigger shows on hover or focus of the row; always where there is no hover (touch). */}
                                <DropdownMenuTrigger asChild>
                                    <Button size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/msg:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100" aria-label={`More actions for ${nameOf(message.sender)}`}>
                                        <LuEllipsis />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align={mine ? "end" : "start"}
                                    className="w-48"
                                    onCloseAutoFocus={(event) => {
                                        const chosen = afterMenu.current;
                                        afterMenu.current = null;
                                        if (!chosen) return;
                                        event.preventDefault();
                                        if (chosen === "react") setReacting(true);
                                        else onReply(message);
                                    }}
                                >
                                    {onReply && <DropdownMenuItem onSelect={() => { afterMenu.current = "reply"; }}><LuReply />Reply</DropdownMenuItem>}
                                    {canReact && <DropdownMenuItem onSelect={() => { afterMenu.current = "react"; }}><LuSmilePlus />React</DropdownMenuItem>}
                                    {message.body && <DropdownMenuItem onSelect={copy}><LuCopy />Copy</DropdownMenuItem>}
                                    {(onReply || canReact || message.body) && <DropdownMenuSeparator />}
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
                    </PopoverAnchor>
                    {canReact && (
                        <PopoverContent align={mine ? "end" : "start"} className="w-auto p-1">
                            <ReactionPicker onPick={(emoji) => { setReacting(false); onReact(message, emoji); }} />
                        </PopoverContent>
                    )}
                    </Popover>
                    {!message.deleted && message.reactions?.length > 0 && (
                        <ul className={cn("m-0 flex list-none flex-wrap gap-1 p-0", mine && "justify-end")} aria-label="Reactions">
                            {message.reactions.map(({ emoji, count, userIds }) => {
                                const reacted = userIds.includes(meId);
                                const inner = (<><span aria-hidden={!canReact || undefined}>{emoji}</span><span aria-hidden={!canReact || undefined}>{count}</span></>);
                                return (
                                    <li key={emoji}>
                                        {canReact ? (
                                            <button
                                                type="button"
                                                aria-pressed={reacted}
                                                aria-label={`${emoji} ${count}, ${reacted ? "remove your reaction" : "add your reaction"}`}
                                                onClick={() => onReact(message, emoji)}
                                                className={cn(CHIP, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", reacted ? "border-primary bg-primary-soft text-primary-ink" : "border-transparent bg-muted text-foreground hover:bg-accent dark:bg-accent dark:hover:bg-muted")}
                                            >{inner}</button>
                                        ) : (
                                            <span role="img" aria-label={`${emoji} ${count}`} className={cn(CHIP, "border-transparent bg-muted text-foreground dark:bg-accent")}>{inner}</span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
            {/* The time once per group; a message being sent, failed or edited keeps its own line. */}
            {(groupEnd || failure || message.status === "sending" || (message.editedAt && !message.deleted)) && (
                <p className={cn("mt-1 flex items-center gap-1.5 text-xs text-muted-foreground", mine ? "pr-3" : "pl-13")}>
                    {message.createdAt && <time dateTime={message.createdAt}>{formatRelative(message.createdAt)}</time>}
                    {message.editedAt && !message.deleted && <span>edited</span>}
                    {mine && !message.deleted && <Status message={message} others={others} failure={failure} onRetry={onRetry} onDiscard={onDiscard} />}
                </p>
            )}

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
