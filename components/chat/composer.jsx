'use client'

import { useEffect, useId, useRef, useState } from "react";

import { IMAGE_TYPES, MAX_ATTACHMENTS, MAX_BODY, MAX_IMAGE_BYTES } from "@/lib/chat/limits";
import { userMessage } from "@/lib/userMessage";
import { useCreateChatUpload, useTypingPing } from "@/mutations/chat.mutation";

import { Button } from "@/components/shadcn/button";
import { Progress } from "@/components/shadcn/progress";
import { Spinner } from "@/components/shadcn/spinner";
import { Textarea } from "@/components/shadcn/textarea";

import { LuImagePlus, LuSendHorizontal, LuTriangleAlert, LuX } from "react-icons/lu";

const COUNTER_FROM = MAX_BODY * 0.9;
const UPLOAD_FAILED = "The image could not be uploaded.";

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

// XMLHttpRequest for the progress events. Content-Length is set by the browser, which refuses it from script.
function put({ url, method = "PUT", headers = {} }, file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        for (const [name, value] of Object.entries(headers)) {
            if (name.toLowerCase() !== "content-length") xhr.setRequestHeader(name, value);
        }
        xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(UPLOAD_FAILED)));
        xhr.onerror = () => reject(new Error(UPLOAD_FAILED));
        xhr.send(file);
    });
}

function refusal(file) {
    if (!IMAGE_TYPES.includes(file.type)) return "Only JPEG, PNG and WebP images can be sent.";
    if (file.size > MAX_IMAGE_BYTES) return `${file.name} is larger than ${MAX_IMAGE_BYTES / 1_000_000} MB.`;
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
    const [images, setImages] = useState([]);   // { key, name, url, progress, status: uploading | done | error, attachmentId, error }
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);

    useEffect(() => {
        const created = urls.current;
        return () => created.forEach((url) => URL.revokeObjectURL(url));
    }, []);

    const update = (key, change) => setImages((list) => list.map((image) => (image.key === key ? { ...image, ...change } : image)));

    const upload = async (file, key) => {
        try {
            const size = await imageSize(file);
            const { attachmentId, upload: target } = await createUpload.mutateAsync({ conversationId, contentType: file.type, size: file.size, ...size });
            await put(target, file, (progress) => update(key, { progress }));
            update(key, { status: "done", progress: 1, attachmentId });
        } catch (err) {
            // A 503 ("Chat images are not configured") lands here too: shown on the image, never thrown.
            update(key, { status: "error", error: userMessage(err, UPLOAD_FAILED) });
        }
    };

    const pick = (event) => {
        const files = [...(event.target.files || [])];
        event.target.value = "";
        const problems = files.map(refusal).filter(Boolean);
        const accepted = files.filter((file) => !refusal(file)).slice(0, MAX_ATTACHMENTS - images.length);
        if (accepted.length < files.length - problems.length) problems.push(`You can attach up to ${MAX_ATTACHMENTS} images.`);
        setError(problems.join(" "));

        const added = accepted.map((file) => {
            const url = URL.createObjectURL(file);
            urls.current.add(url);
            return { key: url, name: file.name, url, progress: 0, status: "uploading", file };
        });
        setImages((list) => [...list, ...added]);
        added.forEach((image) => upload(image.file, image.key));
    };

    const remove = (image) => {
        URL.revokeObjectURL(image.url);
        urls.current.delete(image.url);
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
            await onSubmit({ body, attachmentIds: images.map((image) => image.attachmentId) });
            if (!optimistic) { setBody(""); setImages([]); }
        } catch (err) {
            setBody((current) => current || sent.body);
            setImages((current) => (current.length ? current : sent.images));
            setError(userMessage(err));
        } finally {
            setPending(false);
        }
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border bg-card p-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
            {images.length > 0 && (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Images to send">
                    {images.map((image) => (
                        <li key={image.key} className="relative size-16 overflow-hidden rounded-md border bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview */}
                            <img src={image.url} alt={image.name} className="size-full object-cover" />
                            {image.status === "uploading" && (
                                <Progress value={Math.round(image.progress * 100)} aria-label={`Uploading ${image.name}`} className="absolute inset-x-1 bottom-1 h-1 w-auto" />
                            )}
                            {image.status === "error" && (
                                <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-destructive">
                                    <LuTriangleAlert aria-hidden="true" />
                                </span>
                            )}
                            <Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(image)} aria-label={`Remove ${image.name}`} className="absolute top-0.5 right-0.5 bg-background/80">
                                <LuX aria-hidden="true" />
                            </Button>
                        </li>
                    ))}
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
            {(error || images.some((image) => image.error)) && (
                <div id={`${inputId}-error`} role="alert" className="flex flex-col gap-0.5 text-xs text-destructive">
                    {error && <p>{error}</p>}
                    {images.filter((image) => image.error).map((image) => <p key={image.key}>{image.name}: {image.error}</p>)}
                </div>
            )}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    {imagesAllowed && (
                        <>
                            <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(",")} multiple hidden onChange={pick} />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground"
                                onClick={() => fileRef.current?.click()}
                                disabled={images.length >= MAX_ATTACHMENTS}
                                aria-label="Attach images"
                            >
                                <LuImagePlus aria-hidden="true" />
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
