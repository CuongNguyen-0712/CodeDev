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

import { LuPaperclip, LuSendHorizontal, LuTriangleAlert, LuX } from "react-icons/lu";

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
 * (an open conversation that is not a request).
 */
export default function Composer({ conversationId, imagesAllowed = false, optimistic = false, onSubmit }) {
    const inputId = useId();
    const fileRef = useRef(null);
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

    const ready = images.every((image) => image.status === "done");
    const canSend = (body.trim().length > 0 || images.length > 0) && ready && !pending;

    const submit = async (event) => {
        event?.preventDefault();
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
            await onSubmit({ body, attachmentIds: images.map((image) => image.attachmentId), attachments });
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
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border bg-card p-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
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
            <Textarea
                value={body}
                onChange={(event) => {
                    setBody(event.target.value);
                    if (conversationId) ping();
                }}
                onKeyDown={(event) => {
                    // isComposing: Enter that confirms an IME candidate is not a send.
                    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    event.currentTarget.form.requestSubmit();
                }}
                maxLength={MAX_BODY}
                rows={2}
                placeholder="Write a message"
                aria-label="Message"
                aria-describedby={error ? `${inputId}-error` : undefined}
                className="h-20 resize-none border-0 bg-transparent px-1 shadow-none field-sizing-fixed focus-visible:ring-0 dark:bg-transparent"
            />
            {error && <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    {imagesAllowed && (
                        <>
                            <input ref={fileRef} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden onChange={pick} />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground"
                                onClick={() => fileRef.current?.click()}
                                disabled={images.length >= MAX_ATTACHMENTS}
                                aria-label="Attach files"
                            >
                                <LuPaperclip aria-hidden="true" />
                            </Button>
                        </>
                    )}
                    {/* The counter only matters near the limit. */}
                    <span className="text-xs text-muted-foreground tabular-nums">{body.length > COUNTER_FROM && `${body.length}/${MAX_BODY}`}</span>
                </div>
                <Button type="submit" disabled={!canSend}>
                    {pending ? <Spinner /> : <LuSendHorizontal aria-hidden="true" />}
                    Send
                </Button>
            </div>
        </form>
    );
}
