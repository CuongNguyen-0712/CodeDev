"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Field, FieldDescription, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Textarea } from "@/components/shadcn/textarea";

import { useApp } from "@/contexts/appContext";
import { retryTransient } from "@/lib/queryTimes";
import { useCreatePost, useUpdatePost, useUploadBlogImage } from "@/mutations/blog.mutation";
import { blogQueries } from "@/queries/blog.query";

import { LuImagePlus, LuX } from "react-icons/lu";

// Loaded on the Preview tab only, so the editor's first paint does not include the Markdown stack.
const BlogMarkdown = dynamic(() => import("@/components/blog/markdown"), { loading: () => <Skeleton className="h-40 w-full" /> });

// Inlined at build time by next.config.js, same as portableTextRenderer.
const MEDIA_ORIGINS = (process.env.NEXT_PUBLIC_MEDIA_ORIGINS || "https://res.cloudinary.com").split(",");

const MAX_TAGS = 5;
const PLACEHOLDER = "![Uploading…]()";

function Form({ post, trusted }) {
    const router = useRouter();
    const { showAlert } = useApp();
    const create = useCreatePost();
    const update = useUpdatePost();
    const upload = useUploadBlogImage();
    const textareaRef = useRef(null);
    const fileRef = useRef(null);

    const [title, setTitle] = useState(post?.title || "");
    const [tags, setTags] = useState(post?.tags || []);
    const [tagInput, setTagInput] = useState("");
    const [body, setBody] = useState(post?.body || "");
    const [appealReason, setAppealReason] = useState("");
    const [uploading, setUploading] = useState(0);

    const appealing = post?.status === "hidden" && !post.appealedAt;
    const locked = post?.status === "hidden" && !!post.appealedAt;
    const pending = create.isPending || update.isPending;
    const busy = pending || uploading > 0;
    const submitLabel = appealing ? "Send appeal" : trusted ? "Publish" : "Submit for review";

    const addTag = (raw) => {
        const tag = raw.trim();
        if (tag && !tags.includes(tag) && tags.length < MAX_TAGS) setTags([...tags, tag]);
        setTagInput("");
    };

    const onTagKeyDown = (event) => {
        if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addTag(tagInput);
        } else if (event.key === "Backspace" && !tagInput) {
            setTags(tags.slice(0, -1));
        }
    };

    const uploadImage = async (file) => {
        const area = textareaRef.current;
        const at = area ? area.selectionStart : body.length;
        setBody((current) => current.slice(0, at) + PLACEHOLDER + current.slice(at));
        setUploading((n) => n + 1);
        try {
            const { url } = await upload.mutateAsync(file);
            setBody((current) => current.replace(PLACEHOLDER, `![image](${url})`));
        } catch (error) {
            setBody((current) => current.replace(PLACEHOLDER, ""));
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
        if (!title.trim()) return showAlert(400, "Add a title first");
        if (appealing && !appealReason.trim()) return showAlert(400, "Explain why this post should be restored");

        const input = {
            title: title.trim(),
            tags,
            body,
            submit,
            ...(appealing ? { appealReason: appealReason.trim() } : {}),
        };
        const onError = (error) => showAlert(error?.status || 500, error?.message || "The post was not saved");

        if (post) {
            update.mutate({ id: post.id, ...input }, {
                onSuccess: () => {
                    showAlert(200, appealing ? "Appeal sent" : submit ? "Post submitted" : "Draft saved");
                    if (submit) router.push("/blog/me");
                },
                onError,
            });
        } else {
            create.mutate(input, {
                onSuccess: (saved) => {
                    showAlert(200, submit ? "Post submitted" : "Draft saved");
                    router.replace(submit ? "/blog/me" : `/blog/edit/${saved.id}`);
                },
                onError,
            });
        }
    };

    return (
        <form
            className="flex flex-col gap-5"
            onSubmit={(event) => { event.preventDefault(); if (!busy) save(true); }}
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
                    {locked ? " Your appeal was rejected." : ""}
                </p>
            )}

            <Field>
                <FieldLabel htmlFor="post-title">Title</FieldLabel>
                <Input id="post-title" value={title} maxLength={150} onChange={(event) => setTitle(event.target.value)} disabled={locked} />
            </Field>

            <Field>
                <FieldLabel htmlFor="post-tags">Tags</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                    {tags.map((tag) => (
                        <Badge key={tag} variant="primary" className="gap-1">
                            {tag}
                            <button type="button" aria-label={`Remove tag ${tag}`} className="cursor-pointer" disabled={locked} onClick={() => setTags(tags.filter((item) => item !== tag))}>
                                <LuX className="size-3" aria-hidden="true" />
                            </button>
                        </Badge>
                    ))}
                    {tags.length < MAX_TAGS && (
                        <Input
                            id="post-tags"
                            className="w-40 flex-1"
                            value={tagInput}
                            placeholder="Add a tag"
                            disabled={locked}
                            onChange={(event) => setTagInput(event.target.value)}
                            onKeyDown={onTagKeyDown}
                            onBlur={() => addTag(tagInput)}
                        />
                    )}
                </div>
                <FieldDescription>Press Enter or comma to add. Up to {MAX_TAGS} tags.</FieldDescription>
            </Field>

            <Tabs defaultValue="write">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <TabsList>
                        <TabsTrigger value="write">Write</TabsTrigger>
                        <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                    <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => fileRef.current?.click()}>
                        {uploading > 0 ? <Spinner /> : <LuImagePlus aria-hidden="true" />}
                        Add image
                    </Button>
                    <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
                </div>
                <TabsContent value="write">
                    <Textarea
                        ref={textareaRef}
                        aria-label="Post body in Markdown"
                        className="min-h-80 font-mono"
                        value={body}
                        placeholder="Write in Markdown. Paste an image to upload it."
                        disabled={locked}
                        onChange={(event) => setBody(event.target.value)}
                        onPaste={onPaste}
                    />
                </TabsContent>
                <TabsContent value="preview">
                    <div className="min-h-80 rounded-md border bg-card p-4">
                        {body.trim() ? <BlogMarkdown body={body} origins={MEDIA_ORIGINS} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
                    </div>
                </TabsContent>
            </Tabs>

            {appealing && (
                <Field>
                    <FieldLabel htmlFor="post-appeal">Appeal reason</FieldLabel>
                    <Textarea id="post-appeal" value={appealReason} onChange={(event) => setAppealReason(event.target.value)} />
                    <FieldDescription>You can appeal a hidden post once.</FieldDescription>
                </Field>
            )}

            {!locked && (
                <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy}>
                        {pending && <Spinner />}
                        {submitLabel}
                    </Button>
                    {!appealing && (
                        <Button type="button" variant="outline" disabled={busy} onClick={() => save(false)}>
                            Save draft
                        </Button>
                    )}
                    <Button asChild variant="ghost">
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
    if (mine.isError || (id && post.isError)) {
        const error = post.error || mine.error;
        return (
            <p role="alert" className="text-sm">
                {error?.status === 404 ? "This post does not exist." : error?.message || "Could not load the editor."}
            </p>
        );
    }
    return <Form post={id ? post.data : null} trusted={mine.data.trusted} />;
}
