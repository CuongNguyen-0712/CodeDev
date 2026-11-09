import { ulid } from "ulid";

import { blogDb } from "@/db/blog.db";
import { userDb } from "@/db/user.db";
import { BLOG_LIMITS, extractImageUrls, makeExcerpt, postSlug, readingMinutes } from "@/lib/blog/text.mjs";
import { nextStatus } from "@/lib/blog/status.mjs";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { decodeCursor, encodeCursor, pageOf } from "@/lib/keysetCursor";
import { isAllowedMediaUrl, mediaOrigins } from "@/lib/media/mediaOrigins.mjs";
import { revalidateBlog } from "@/lib/pageCache";
import { dispatchAuthOutbox } from "@/services/authOutbox.service";

const PAGE = 12;
const DAY = 86400000;

const purgeDays = Number(process.env.BLOG_HIDDEN_PURGE_DAYS);
/** Days a hidden post is kept before the purge job deletes it. */
export const BLOG_HIDDEN_PURGE_DAYS = Number.isInteger(purgeDays) && purgeDays > 0 ? purgeDays : 30;

/** When a hidden post is deleted: hidden_at plus the grace period. */
export const purgeAtOf = (status, hiddenAt) => (status === "hidden" && hiddenAt ? new Date(new Date(hiddenAt).getTime() + BLOG_HIDDEN_PURGE_DAYS * DAY) : null);

const notFound = () => new ApiError("Post not found", 404);
const author = (row) => ({ id: row.author_id, username: row.author_username, image: row.author_image });
const publicPost = (row) => ({
    id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt, tags: row.tags, publishedAt: row.published_at,
    readingMinutes: readingMinutes(row.body), author: author(row),
});

function checkImages(body) {
    const urls = extractImageUrls(body);
    if (urls.length > BLOG_LIMITS.images) throw new ApiError(`At most ${BLOG_LIMITS.images} images per post`, 400);
    const origins = mediaOrigins();
    if (urls.some((url) => !isAllowedMediaUrl(url, origins))) throw new ApiError("Images must be uploaded to CodeDev", 400);
    return urls;
}

// One transaction for create and update; postId null means create.
async function write({ userId, postId = null, input }) {
    if (!(await userDb.isEmailVerified({ userId }))) throw new ApiError("Verify your email to write on the blog", 403);
    const result = await withTransaction(async (client) => {
        const user = await blogDb.userByPublicId(client, userId);
        if (!user) throw notFound();
        const current = postId ? await blogDb.lockOwn(client, { authorDbId: user.id, publicId: postId }) : null;
        if (postId && (!current || current.deleted_at)) throw notFound();
        const { status, appeal } = nextStatus({
            current: current?.status ?? null, submit: input.submit, trusted: await blogDb.isTrusted(user.id, client),
            appealing: Boolean(input.appealReason), appealedAt: current?.appealed_at ?? null,
        });
        const urls = checkImages(input.body);
        const fields = { title: input.title, excerpt: makeExcerpt(input.body), body: input.body, tags: input.tags, status };
        let publicId = postId, dbId = current?.id, slug = current?.slug;
        if (current) {
            await blogDb.update(client, { id: dbId, ...fields, appeal, appealReason: input.appealReason ?? null });
        } else {
            publicId = `pst_${ulid().toLowerCase()}`;
            slug = postSlug(input.title, publicId);
            ({ id: dbId } = await blogDb.insert(client, { publicId, authorDbId: user.id, slug, ...fields }));
        }
        await blogDb.replaceAssets(client, { postDbId: dbId, authorDbId: user.id, urls });
        return { id: publicId, slug, status, wasPublished: current?.status === "published" };
    });
    revalidateAfter(result);
    return { id: result.id, slug: result.slug, status: result.status };
}

function revalidateAfter({ id, status, wasPublished }) {
    if (status === "published" || wasPublished) revalidateBlog(id);
}

export const blogService = {
    create: ({ userId, input }) => write({ userId, input }),

    update: ({ userId, postId, input }) => write({ userId, postId, input }),

    remove: async ({ userId, postId }) => {
        const result = await withTransaction(async (client) => {
            const user = await blogDb.userByPublicId(client, userId);
            const current = user && await blogDb.lockOwn(client, { authorDbId: user.id, publicId: postId });
            if (!current || current.deleted_at) throw notFound();
            await blogDb.softDelete(client, { id: current.id });
            return { id: postId, status: current.status, wasPublished: current.status === "published" };
        });
        revalidateAfter(result);
        return { deleted: true };
    },

    listMine: async ({ userId }) => {
        const authorDbId = await blogDb.userDbId(userId);
        if (!authorDbId) return { trusted: false, items: [] };
        const [trusted, rows] = await Promise.all([blogDb.isTrusted(authorDbId), blogDb.listMine(authorDbId)]);
        return {
            trusted,
            items: rows.map((row) => ({
                id: row.id, slug: row.slug, title: row.title, status: row.status, rejectReason: row.reject_reason,
                hiddenReason: row.hidden_reason, hiddenAt: row.hidden_at, appealedAt: row.appealed_at,
                purgeAt: purgeAtOf(row.status, row.hidden_at),
                updatedAt: row.updated_at,
            })),
        };
    },

    getOwn: async ({ userId, postId }) => {
        const authorDbId = await blogDb.userDbId(userId);
        const row = authorDbId && await blogDb.getOwn(authorDbId, postId);
        if (!row) throw notFound();
        return {
            id: row.id, slug: row.slug, title: row.title, tags: row.tags, body: row.body, status: row.status,
            rejectReason: row.reject_reason, hiddenReason: row.hidden_reason, appealedAt: row.appealed_at,
        };
    },

    listPublished: async ({ tag = null, cursor = null } = {}) => {
        const rows = await blogDb.listPublished({ tag, cursor: decodeCursor(cursor, /^pst_[0-9a-z]{26}$/), limit: PAGE + 1 });
        const { items, nextCursor } = pageOf(rows, PAGE, (last) => encodeCursor(last.cursor_at, last.cursor_id));
        return { items: items.map(publicPost), nextCursor };
    },

    getPublishedBySlug: async (slug) => {
        const row = await blogDb.getPublishedBySlug(slug);
        return row && { ...publicPost(row), body: row.body, updatedAt: row.updated_at };
    },

    /** Deletes posts hidden for more than `days`, with the assets only they used; storage files go through the outbox. */
    runHiddenPurge: async ({ limit = 50, days = BLOG_HIDDEN_PURGE_DAYS } = {}) => {
        const result = await withTransaction(async (client) => {
            const posts = await blogDb.lockExpiredHidden(client, { days, limit });
            if (!posts.length) return { posts, files: [], outboxIds: [] };
            const ids = posts.map((post) => post.id);
            const files = (await blogDb.retireOrphanAssets(client, { postIds: ids })).filter((f) => f.key).map((f) => ({ provider: f.provider, key: f.key, bucket: null }));
            await blogDb.deletePosts(client, { ids });
            return { posts, files, outboxIds: files.length ? [await blogDb.queueStoragePurge(client, { files })] : [] };
        });
        if (result.outboxIds.length) {
            // The rows are committed; the outbox worker retries anything undelivered.
            await dispatchAuthOutbox(result.outboxIds).catch((error) => console.error("[blog-purge] outbox dispatch failed", error));
        }
        result.posts.forEach((post) => revalidateBlog(post.public_id));
        return { purged: result.posts.length, files: result.files.length, outboxIds: result.outboxIds };
    },
};
