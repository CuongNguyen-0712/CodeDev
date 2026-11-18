'use client'

import { useEffect, useId, useRef, useState } from "react";

import { formatFileSize, isAllowedFile } from "@/lib/chat/fileInfo";
import { ATTACHMENT_ACCEPT, IMAGE_TYPES, MAX_ATTACHMENTS, MAX_BODY, MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "@/lib/chat/limits";
import { userMessage } from "@/lib/userMessage";

import FileIcon from "@/components/chat/fileIcon";
import { showAlert } from "@/components/ui/alert";
import { useCreateChatUpload, useTypingPing } from "@/mutations/chat.mutation";

import { Button } from "@/components/shadcn/button";
import { Progress } from "@/components/shadcn/progress";
import { Spinner } from "@/components/shadcn/spinner";
import { Textarea } from "@/components/shadcn/textarea";

import { LuCheck, LuPaperclip, LuReply, LuSendHorizontal, LuTriangleAlert, LuX } from "react-icons/lu";

const COUNTER_FROM = MAX_BODY * 0.9;
const UPLOAD_FAILED = "The file could not be uploaded.";

async function imageSize(file) {
    try {
        const bitmap = await createImageBitmap(file);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return size;
    } catch {
        throw new Error("This image could not be read.");
    }
}

// XMLHttpRequest for the progress events. A PUT ticket (S3, Upstash) sends the file as the body with the ticket's
// headers; a POST ticket (Cloudinary) sends a form of its fields, then the file. Content-Length is set by the
// browser, which refuses it from script.
function put({ url, method = "PUT", headers = {}, fields }, file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        let body = file;
        if (method === "POST") {
            body = new FormData();
            for (const [name, value] of Object.entries(fields || {})) body.append(name, value);
            body.append("file", file);   // last: the provider ignores fields after it
        } else {
            for (const [name, value] of Object.entries(headers)) {
                if (name.toLowerCase() !== "content-length") xhr.setRequestHeader(name, value);
            }
        }
        xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(UPLOAD_FAILED)));
        xhr.onerror = () => reject(new Error(UPLOAD_FAILED));
        xhr.send(body);
    });
}

// An image by MIME type, else a file by extension, else refused (null).
const kindOf = (file) => (IMAGE_TYPES.includes(file.type) ? "image" : isAllowedFile(file.name) ? "file" : null);

// [status, message] for a file the composer will not upload: 400 wrong type, 413 too large (as Settings does for avatars).
function refusal(file) {
    const kind = kindOf(file);
    if (!kind) return [400, `${file.name}: this file type can't be sent.`];
    const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (file.size > max) return [413, `${file.name} is larger than ${max / 1_000_000} MB.`];
    return null;
}

/**
 * Message box: Enter sends, Shift+Enter adds a line. `onSubmit({ body, attachmentIds })` returns a promise;
 * when it rejects the text comes back and the error shows here. `optimistic`: the box clears at once (the
 * message shows in the list while it sends); otherwise it waits for the send. Images need `imagesAllowed`
 * (an open conversation that is not a request). `replyTo` ({ id, senderName, preview }) shows the Replying-to bar and
 * is sent as `replyToId`; `onCancelReply` is its ✕.
 * `editing` ({ id, body }) turns the box into an edit of that message: no Attach (the thread's overlay previews the text via `onEditDraftChange(body)`), Enter calls
 * `onSaveEdit(body)` (a promise; it rejects on failure and the box stays in edit mode), Esc calls `onCancelEdit`.
 * The parent leaves edit mode after a save; the text typed before Edit comes back then.
 */
export default function Composer({ conversationId, imagesAllowed = false, optimistic = false, replyTo, onCancelReply, editing, onSaveEdit, onCancelEdit, onEditDraftChange, onSubmit }) {
    const inputId = useId();
    const fileRef = useRef(null);
    const boxRef = useRef(null);
    const urls = useRef(new Set());
    const createUpload = useCreateChatUpload();
    const ping = useTypingPing(conversationId);
    const [body, setBody] = useState("");
    const [images, setImages] = useState([]);   // images and files: { key, kind, name, size, url?, width?, height?, progress, status: uploading | done | error, attachmentId, error }
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);

    useEffect(() => {
        const created = urls.current;
        return () => created.forEach((url) => URL.revokeObjectURL(url));
    }, []);

    // Choosing Reply moves the caret to the box.
    useEffect(() => { if (replyTo) boxRef.current?.focus(); }, [replyTo?.id]);   // eslint-disable-line react-hooks/exhaustive-deps -- the id is the trigger

    // Edit swaps the box's text for the message's and puts the draft back when edit mode ends (set during render, as React advises for state that follows a prop).
    const [editId, setEditId] = useState(null);
    const [draft, setDraft] = useState("");
    if ((editing?.id ?? null) !== editId) {
        setEditId(editing?.id ?? null);
        setError("");
        if (editing) {
            if (editId === null) setDraft(body);   // moving to another message keeps the first draft
            setBody(editing.body);
        } else setBody(draft);
    }
    // The thread previews what is typed: the starting text, then every change.
    useEffect(() => { if (editing) onEditDraftChange?.(body); }, [editing?.id, body]);   // eslint-disable-line react-hooks/exhaustive-deps -- the callback's identity is not a trigger
    useEffect(() => { if (editing) boxRef.current?.focus(); }, [editing?.id]);   // eslint-disable-line react-hooks/exhaustive-deps -- the id is the trigger

    const update = (key, change) => setImages((list) => list.map((image) => (image.key === key ? { ...image, ...change } : image)));

    const upload = async (file, key, kind) => {
        try {
            const meta = kind === "image" ? { kind, contentType: file.type, ...(await imageSize(file)) } : { kind };
            const { attachmentId, upload: target } = await createUpload.mutateAsync({ conversationId, name: file.name, size: file.size, ...meta });
            await put(target, file, (progress) => update(key, { progress }));
            update(key, { status: "done", progress: 1, attachmentId, width: meta.width, height: meta.height });
        } catch (err) {
            // A 503 ("Chat images are not configured") lands here too: a toast and a marker on the image, never thrown.
            const message = userMessage(err, UPLOAD_FAILED);
            update(key, { status: "error", error: message });
            showAlert(err?.status || 500, `${file.name}: ${message}`);
        }
    };

    const pick = (event) => {
        const files = [...(event.target.files || [])];
        event.target.value = "";
        const problems = files.map(refusal).filter(Boolean);
        const accepted = files.filter((file) => !refusal(file)).slice(0, MAX_ATTACHMENTS - images.length);
        if (accepted.length < files.length - problems.length) problems.push([400, `You can attach up to ${MAX_ATTACHMENTS} files.`]);
        // A refused file is a toast, like an oversized avatar in Settings; the thumbnails show only what was kept.
        for (const [status, message] of problems) showAlert(status, message);

        const added = accepted.map((file) => {
            const kind = kindOf(file);
            let url;
            if (kind === "image") {
                url = URL.createObjectURL(file);
                urls.current.add(url);
            }
            return { key: url || `${file.name}-${crypto.randomUUID()}`, kind, name: file.name, size: file.size, url, progress: 0, status: "uploading", file };
        });
        setImages((list) => [...list, ...added]);
        added.forEach((image) => upload(image.file, image.key, image.kind));
    };

    const remove = (image) => {
        if (image.url) {
            URL.revokeObjectURL(image.url);
            urls.current.delete(image.url);
        }
        setImages((list) => list.filter((i) => i.key !== image.key));
    };

    const showCounter = body.length > COUNTER_FROM;
    const ready = images.every((image) => image.status === "done");
    const canSend = editing ? body.trim().length > 0 && !pending : (body.trim().length > 0 || images.length > 0) && ready && !pending;

    const submit = async (event) => {
        event?.preventDefault();
        if (editing) {
            if (pending) return;
            // Nothing to save: leave edit mode, as Messenger does.
            if (!body.trim() || body === editing.body) return onCancelEdit();
            setError("");
            setPending(true);
            try { await onSaveEdit(body); } catch (err) { setError(userMessage(err)); } finally { setPending(false); }
            return;
        }
        // Enter submits past the disabled button, so the same rule is checked here.
        if (!canSend) return;
        const sent = { body, images };
        setError("");
        if (optimistic) { setBody(""); setImages([]); } else setPending(true);
        try {
            // `attachments` is the MessageDto shape, for the message that shows while it sends (previewUrl: a sending image's local blob).
            const attachments = images.map((i) => (i.kind === "image"
                ? { id: i.attachmentId, kind: "image", width: i.width, height: i.height, previewUrl: i.url }
                : { id: i.attachmentId, kind: "file", name: i.name, size: i.size }));
            await onSubmit({ body, attachmentIds: images.map((image) => image.attachmentId), attachments, replyToId: replyTo?.id });
            if (!optimistic) { setBody(""); setImages([]); }
        } catch (err) {
            setBody((current) => current || sent.body);
            // The server deleted the rejected upload (the error does not name which), so a resend would 422 forever: drop every chip, keep the text.
            if (err?.status === 422 && /uploaded \w+ is invalid/i.test(err.message)) {
                setImages([]);
                showAlert(422, "An attachment was rejected. Add your attachments again.");
            } else {
                setImages((current) => (current.length ? current : sent.images));
                setError(userMessage(err));
            }
        } finally {
            setPending(false);
        }
    };

    return (
        // A filled pill, not a framed card: no border at rest, a quiet one on focus. Its controls are all 36px
        // tall and bottom-aligned, so one line of text sits on their centre line and longer text grows upward.
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-3xl border border-transparent bg-muted p-1.5 transition-colors focus-within:border-ring/40 focus-within:bg-background dark:bg-accent dark:focus-within:bg-accent">
            {replyTo && !editing && (
                // Bordered, so it stays visible on the pill both at rest (muted) and on focus (background).
                <div className="flex items-center gap-2 rounded-2xl border bg-background py-1.5 pr-1 pl-3 text-xs dark:bg-card">
                    <LuReply aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 flex-1 truncate">Replying to <span className="font-medium">{replyTo.senderName}</span>: {replyTo.preview}</p>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={onCancelReply} aria-label="Cancel reply"><LuX aria-hidden="true" /></Button>
                </div>
            )}
            {images.length > 0 && (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Attachments to send">
                    {images.map((image) => (image.kind === "file" ? (
                        <li key={image.key} className="relative flex h-16 w-52 max-w-full items-center gap-2 overflow-hidden rounded-md border bg-muted py-2 pr-8 pl-3">
                            {image.status === "error"
                                ? <LuTriangleAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />
                                : <FileIcon name={image.name} className="size-5 shrink-0 text-muted-foreground" />}
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="truncate text-sm font-medium" title={image.name}>{image.name}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">{formatFileSize(image.size)}</span>
                            </div>
                            {image.status === "uploading" && (
                                <Progress value={Math.round(image.progress * 100)} aria-label={`Uploading ${image.name}`} className="absolute inset-x-2 bottom-1 h-1 w-auto" />
                            )}
                            {image.status === "error" && <span className="sr-only">{image.name}: {image.error}</span>}
                            <Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(image)} aria-label={`Remove ${image.name}`} className="absolute top-0.5 right-0.5">
                                <LuX aria-hidden="true" />
                            </Button>
                        </li>
                    ) : (
                        <li key={image.key} className="relative size-16 overflow-hidden rounded-md border bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview */}
                            <img src={image.url} alt={image.name} className="size-full object-cover" />
                            {image.status === "uploading" && (
                                <Progress value={Math.round(image.progress * 100)} aria-label={`Uploading ${image.name}`} className="absolute inset-x-1 bottom-1 h-1 w-auto" />
                            )}
                            {image.status === "error" && (
                                <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-destructive">
                                    <LuTriangleAlert aria-hidden="true" />
                                    <span className="sr-only">{image.name}: {image.error}</span>
                                </span>
                            )}
                            <Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(image)} aria-label={`Remove ${image.name}`} className="absolute top-0.5 right-0.5 bg-background/80">
                                <LuX aria-hidden="true" />
                            </Button>
                        </li>
                    )))}
                </ul>
            )}
            <div className="flex items-end gap-1">
                {imagesAllowed && !editing && (
                    <>
                        <input ref={fileRef} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={pick} />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 rounded-full text-muted-foreground hover:bg-background hover:text-foreground dark:hover:bg-card"
                            onClick={() => fileRef.current?.click()}
                            disabled={images.length >= MAX_ATTACHMENTS}
                            aria-label="Attach files"
                        >
                            <LuPaperclip aria-hidden="true" />
                        </Button>
                    </>
                )}
                <Textarea
                    ref={boxRef}
                    value={body}
                    onChange={(event) => {
                        setBody(event.target.value);
                        if (conversationId) ping();
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Escape" && editing && !event.nativeEvent.isComposing) return onCancelEdit();
                        // isComposing: Enter that confirms an IME candidate is not a send.
                        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        event.currentTarget.form.requestSubmit();
                    }}
                    maxLength={MAX_BODY}
                    rows={1}
                    placeholder="Write a message"
                    aria-label={editing ? "Edit message" : "Message"}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    // Grows with the text from one line (36px: 20px line + 8px top and bottom, the buttons' height);
                    // max-h-36 is about six lines of text-sm, then it scrolls.
                    className="min-h-9 max-h-36 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-2 text-sm leading-5 shadow-none placeholder:text-muted-foreground focus-visible:ring-0 md:text-sm dark:bg-transparent"
                />
                <Button type="submit" size="icon" disabled={!canSend} aria-label={editing ? "Save changes" : "Send"} className="shrink-0 rounded-full disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-100">
                    {pending ? <Spinner /> : editing ? <LuCheck aria-hidden="true" /> : <LuSendHorizontal aria-hidden="true" />}
                </Button>
            </div>
            {(error || showCounter) && (
                <div className="flex items-start justify-between gap-3 px-3 pb-1">
                    {error ? <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">{error}</p> : <span />}
                    {/* The counter only matters near the limit. */}
                    {showCounter && <span className="text-xs text-muted-foreground tabular-nums">{`${body.length}/${MAX_BODY}`}</span>}
                </div>
            )}
        </form>
    );
}
