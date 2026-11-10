"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Textarea } from "@/components/shadcn/textarea";

import { READING_PROSE } from "@/components/blog/shared";
import { ErrorReload } from "@/components/ui/error";
import { announceRewards } from "@/components/ui/level";
import { useApp } from "@/contexts/appContext";
import { addTags } from "@/lib/blog/tags.mjs";
import { retryTransient } from "@/lib/queryTimes";
import { useCreatePost, useUpdatePost, useUploadBlogImage } from "@/mutations/blog.mutation";
import { blogQueries } from "@/queries/blog.query";

import { LuImagePlus, LuX } from "react-icons/lu";

// Loaded on the Preview tab only, so the editor's first paint does not include the Markdown stack.
const BlogMarkdown = dynamic(() => import("@/components/blog/markdown"), { loading: () => <Skeleton className="h-40 w-full" /> });

// Inlined at build time by next.config.js, same as portableTextRenderer.
const MEDIA_ORIGINS = (process.env.NEXT_PUBLIC_MEDIA_ORIGINS || "https://res.cloudinary.com").split(",");

const MAX_TAGS = 5;
const placeholder = (n) => `![Uploading… ${n}]()`;
// The server prefixes zod issues with their field path ("tags.0: Invalid tag"); the author only needs the message.
const errorText = (error) => (error?.message || "The post was not saved").replace(/^(title|tags|body|submit|appealReason)(\.\d+)?: /, "");

// The help line under the body: one chip per piece of syntax.
const MARKDOWN_HINTS = ["## Heading", "**bold**", "`code`", "```js", "- list", "[text](url)"];

function Form({ post, trusted }) {
    const router = useRouter();
    const { showAlert } = useApp();
    const create = useCreatePost();
    const update = useUpdatePost();
    const upload = useUploadBlogImage();
    const textareaRef = useRef(null);
    const fileRef = useRef(null);
    const uploadCount = useRef(0);

    const [title, setTitle] = useState(post?.title || "");
    const [tags, setTags] = useState(post?.tags || []);
    const [tagInput, setTagInput] = useState("");
    const [tagError, setTagError] = useState("");
    const [body, setBody] = useState(post?.body || "");
    const [appealReason, setAppealReason] = useState("");
    const [uploading, setUploading] = useState(0);
    const [created, setCreated] = useState(false);
    const [errors, setErrors] = useState({});
    const [tab, setTab] = useState("write");
    const clearError = (key) => setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));

    const appealing = post?.status === "hidden" && !post.appealedAt;
    // A pending post with appealedAt is the appeal under review; the server answers 409 to any save on it.
    const underAppeal = post?.status === "pending" && !!post.appealedAt;
    const locked = (post?.status === "hidden" && !!post.appealedAt) || underAppeal;
    const live = post?.status === "published";
    const pending = create.isPending || update.isPending;
    const busy = pending || created || uploading > 0;
    const submitLabel = appealing ? "Send appeal" : live ? "Save changes" : trusted ? "Publish" : "Submit for review";
    const submitHint = appealing ? "A moderator reviews your appeal."
        : live ? "Changes show on the post as soon as you save."
            : trusted ? "Your post goes live when you publish."
                : "A moderator reviews it before it goes live.";

    // Every part is a tag; `rest` (the text after the last comma) stays in the input.
    const takeTags = (parts, rest = "") => {
        const result = addTags(tags, parts, MAX_TAGS);
        setTags(result.tags);
        if (result.tags.length) clearError("tags");
        setTagError(result.invalid.length ? `"${result.invalid.join('", "')}" is not a valid tag. Use letters, numbers and hyphens, up to 30 characters.` : "");
        setTagInput(rest);
    };

    // Splitting on change (not keydown) also covers paste and IME keyboards that report "Process" or "Unidentified".
    const onTagChange = (event) => {
        const parts = event.target.value.split(",");
        const rest = parts.pop();
        if (parts.length) takeTags(parts, rest);
        else setTagInput(rest);
    };

    const onTagKeyDown = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            takeTags([tagInput]);
        } else if (event.key === "Backspace" && !tagInput) {
            setTags(tags.slice(0, -1));
        }
    };

    const uploadImage = async (file) => {
        const area = textareaRef.current;
        const at = area ? area.selectionStart : body.length;
        const token = placeholder(++uploadCount.current);
        setBody((current) => current.slice(0, at) + token + current.slice(at));
        setUploading((n) => n + 1);
        try {
            const { url } = await upload.mutateAsync(file);
            setBody((current) => current.replace(token, `![image](${url})`));
        } catch (error) {
            setBody((current) => current.replace(token, ""));
            showAlert(error?.status || 500, error?.message || "The image was not uploaded");
        } finally {
            setUploading((n) => n - 1);
        }
    };

    const onPaste = (event) => {
        const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"));
        if (!file) return;
        event.preventDefault();
        uploadImage(file);
    };

    const onFile = (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) uploadImage(file);
    };

    const save = (submit) => {
        // Missing fields are reported on the field, and the first one takes focus; toasts are for server errors.
        const missing = {
            ...(!title.trim() && { title: "Add a title" }),
            ...(!tags.length && { tags: "Add at least one tag" }),
            ...(appealing && !appealReason.trim() && { appeal: "Explain why this post should be restored" }),
        };
        setErrors(missing);
        const first = missing.title ? "post-title" : missing.tags ? "post-tags" : missing.appeal ? "post-appeal" : null;
        if (first) return document.getElementById(first)?.focus();

        const input = {
            title: title.trim(),
            tags,
            body,
            submit,
            ...(appealing ? { appealReason: appealReason.trim() } : {}),
        };
        const onError = (error) => showAlert(error?.status || 500, errorText(error));
        // The publish toast replaces the plain alert when the server paid EXP.
        const announce = (saved, alert) => saved?.rewards
            ? announceRewards(saved.rewards, { title: "Post published", id: `blog-published:${saved.id}` })
            : showAlert(200, alert);

        if (post) {
            update.mutate({ id: post.id, ...input }, {
                onSuccess: (saved) => {
                    announce(saved, appealing ? "Appeal sent" : live ? "Changes saved" : submit ? "Post submitted" : "Draft saved");
                    if (submit) router.push("/blog/me");
                },
                onError,
            });
        } else {
            create.mutate(input, {
                onSuccess: (saved) => {
                    setCreated(true);
                    announce(saved, submit ? "Post submitted" : "Draft saved");
                    router.replace(submit ? "/blog/me" : `/blog/edit/${saved.id}`);
                },
                onError,
            });
        }
    };

    const wordCount = body.split(/\s+/).filter(Boolean).length;

    return (
        <form
            className="flex flex-col gap-5"
            onSubmit={(event) => event.preventDefault()}
            aria-busy={pending}
        >
            {post?.status === "rejected" && post.rejectReason && (
                <p role="status" className="rounded-lg border border-warning/20 bg-warning-soft p-3 text-sm text-warning">
                    Rejected: {post.rejectReason}
                </p>
            )}
            {post?.status === "hidden" && (
                <p role="status" className="rounded-lg border border-warning/20 bg-warning-soft p-3 text-sm text-warning">
                    This post was hidden{post.hiddenReason ? `: ${post.hiddenReason}` : "."}
                    {locked ? " Your appeal was already used." : ""}
                </p>
            )}
            {underAppeal && (
                <p role="status" className="rounded-lg border border-warning/20 bg-warning-soft p-3 text-sm text-warning">
                    Your appeal is waiting for review.
                </p>
            )}

            <Field>
                <FieldLabel htmlFor="post-title">Title</FieldLabel>
                <Input
                    id="post-title"
                    className="h-10 bg-card text-base font-medium dark:bg-card"
                    value={title}
                    maxLength={150}
                    placeholder="What did you learn? e.g. Reading a PostgreSQL query plan"
                    disabled={locked}
                    aria-invalid={errors.title ? true : undefined}
                    aria-describedby={errors.title ? "post-title-help post-title-error" : "post-title-help"}
                    onChange={(event) => { setTitle(event.target.value); clearError("title"); }}
                />
                {/* Help first, so it does not move when an error appears under it. */}
                <FieldDescription id="post-title-help" className="tabular-nums">{title.length}/150</FieldDescription>
                {errors.title && <FieldError id="post-title-error">{errors.title}</FieldError>}
            </Field>

            <Field>
                <FieldLabel htmlFor="post-tags">Tags</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                    {tags.map((tag) => (
                        <Badge key={tag} variant="primary" className="gap-1">
                            {tag}
                            <button
                                type="button"
                                aria-label={`Remove tag ${tag}`}
                                // A 20px target with its own focus ring: the Badge's ring does not reach an inner button.
                                // The ring is inset, because the Badge clips anything drawn outside it.
                                className="-mr-1 inline-flex size-5 cursor-pointer items-center justify-center rounded-sm hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50"
                                disabled={locked}
                                onClick={() => setTags(tags.filter((item) => item !== tag))}
                            >
                                <LuX className="size-3" aria-hidden="true" />
                            </button>
                        </Badge>
                    ))}
                    <Input
                        id="post-tags"
                        className="w-40 flex-1 bg-card dark:bg-card"
                        value={tagInput}
                        placeholder="Add a tag"
                        disabled={locked || tags.length >= MAX_TAGS}
                        aria-invalid={tagError || errors.tags ? true : undefined}
                        aria-describedby={tagError || errors.tags ? "post-tags-help post-tags-error" : "post-tags-help"}
                        onChange={onTagChange}
                        onKeyDown={onTagKeyDown}
                        onBlur={() => tagInput.trim() && takeTags([tagInput])}
                    />
                </div>
                {/* Help first, so it does not move when an error appears under it. */}
                <FieldDescription id="post-tags-help">Press Enter or comma to add. Up to {MAX_TAGS} tags.</FieldDescription>
                {(tagError || errors.tags) && <FieldError id="post-tags-error">{tagError || errors.tags}</FieldError>}
            </Field>

            {/* One framed composer: toolbar, text and help share a card-coloured box, so the text area is
                not a grey block on the page and the focus ring wraps the whole thing. */}
            <Tabs value={tab} onValueChange={setTab} className="gap-0 overflow-hidden rounded-lg border bg-card focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 focus-within:ring-inset">
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5">
                    <TabsList>
                        <TabsTrigger value="write">Write</TabsTrigger>
                        <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                    {/* Only on Write: on Preview it would insert into a textarea nobody sees. */}
                    {tab === "write" && (
                        <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => fileRef.current?.click()}>
                            {uploading > 0 ? <Spinner /> : <LuImagePlus aria-hidden="true" />}
                            Add image
                        </Button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
                </div>
                <TabsContent value="write">
                    <Textarea
                        ref={textareaRef}
                        aria-label="Post body in Markdown"
                        aria-describedby="post-body-help"
                        // Fixed height (the base grows with the text): the page and its action bar stay put while writing.
                        // Borderless on the card colour: the composer box draws the frame and the focus ring.
                        className="h-[min(28rem,55dvh)] min-h-64 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 py-3 font-mono leading-relaxed shadow-none field-sizing-fixed focus-visible:ring-0 dark:bg-transparent"
                        value={body}
                        placeholder="Write in Markdown. Paste an image to upload it."
                        disabled={locked}
                        onChange={(event) => setBody(event.target.value)}
                        onPaste={onPaste}
                    />
                </TabsContent>
                <TabsContent value="preview">
                    <div className="h-[min(28rem,55dvh)] min-h-64 overflow-y-auto px-5 py-4">
                        {/* Same size and column as the post page, so the preview is what readers get. */}
                        <div className="max-w-[40rem]">
                            {body.trim() ? <BlogMarkdown body={body} origins={MEDIA_ORIGINS} className={READING_PROSE} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
                        </div>
                    </div>
                </TabsContent>
                <div id="post-body-help" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-0.5">Markdown</span>
                        {MARKDOWN_HINTS.map((hint) => (
                            <code key={hint} className="rounded border bg-background px-1.5 py-0.5 font-mono text-[0.6875rem] leading-none text-foreground">{hint}</code>
                        ))}
                    </span>
                    <span className="tabular-nums">{wordCount} {wordCount === 1 ? "word" : "words"} · {Math.max(1, Math.ceil(wordCount / 200))} min read</span>
                </div>
            </Tabs>

            {appealing && (
                <Field>
                    <FieldLabel htmlFor="post-appeal">Appeal reason</FieldLabel>
                    <Textarea
                        id="post-appeal"
                        value={appealReason}
                        aria-invalid={errors.appeal ? true : undefined}
                        aria-describedby={errors.appeal ? "post-appeal-help post-appeal-error" : "post-appeal-help"}
                        onChange={(event) => { setAppealReason(event.target.value); clearError("appeal"); }}
                        className="h-24 resize-none field-sizing-fixed"
                    />
                    <FieldDescription id="post-appeal-help">You can appeal a hidden post once.</FieldDescription>
                    {errors.appeal && <FieldError id="post-appeal-error">{errors.appeal}</FieldError>}
                </Field>
            )}

            {locked ? (
                <div>
                    <Button asChild variant="outline">
                        <Link href="/blog/me">Back to my posts</Link>
                    </Button>
                </div>
            ) : (
                // Sticks to the bottom, so the primary action stays in reach on a long post.
                <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-2 border-t bg-background/95 py-3 backdrop-blur-sm">
                    {/* A live post stays published on save (lib/blog/status.mjs), so it has one "Save changes" button. */}
                    {/* Phones: 12px padding keeps the three actions on one 343px row. */}
                    <Button type="button" disabled={busy} onClick={() => save(!live)} className="max-sm:px-3">
                        {pending && <Spinner />}
                        {submitLabel}
                    </Button>
                    {!appealing && !live && (
                        <Button type="button" variant="outline" disabled={busy} onClick={() => save(false)} className="max-sm:px-3">
                            Save draft
                        </Button>
                    )}
                    <p className="order-last basis-full text-xs text-muted-foreground sm:order-none sm:basis-auto sm:pl-2">{submitHint}</p>
                    <Button asChild variant="ghost" className="ml-auto max-sm:px-3">
                        <Link href="/blog/me">Cancel</Link>
                    </Button>
                </div>
            )}
        </form>
    );
}

// `id` is the post public id when editing; without it the form starts empty.
export default function PostEditor({ id }) {
    const mine = useQuery({ ...blogQueries.mine(), retry: retryTransient });
    const post = useQuery({ ...blogQueries.post(id), enabled: !!id, retry: retryTransient });

    if (mine.isPending || (id && post.isPending)) {
        return <Skeleton className="h-96 w-full" />;
    }
    if (id && post.isError) {
        // A missing post has nothing to retry; anything else gets the house retry block.
        if (post.error?.status !== 404) return <ErrorReload data={post.error} refetch={() => post.refetch()} />;
        return (
            <div className="flex flex-col items-start gap-3">
                <p role="alert" className="text-sm">This post does not exist.</p>
                <Button asChild variant="outline">
                    <Link href="/blog/me">Back to my posts</Link>
                </Button>
            </div>
        );
    }
    return <Form post={id ? post.data : null} trusted={mine.data?.trusted ?? false} />;
}
