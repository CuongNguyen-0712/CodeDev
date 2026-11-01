import { adminDb } from "@/db/admin.db";
import { adminCatalogDb, CATALOG_KINDS } from "@/db/adminCatalog.db";
import { redis } from "@/lib/cache";
import { cacheKeys } from "@/lib/cacheKeys";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

// Filter options, catalog stats and recommendations read these lists from caches.
const dropCaches = () => redis.del(cacheKeys.courseFilterOptions(), cacheKeys.catalogStats(), cacheKeys.recommendationCandidates()).catch(() => {});

const audit = (client, actor, { action, kind, id, reason, before = null, after = null, ip = null }) =>
    adminDb.audit(client, { actorId: actor.id, action, targetType: kind, targetId: id, reason, before, after, ip });

/** Categories, languages, skills, career roles, industries, learning goals (catalog.update to change). */
export const adminCatalogService = {
    list: async ({ kind }) => ({ kind, coded: CATALOG_KINDS[kind].coded, items: await adminCatalogDb.list({ kind }) }),

    create: async ({ actor, kind, name, code, reason, ip = null }) => {
        if (CATALOG_KINDS[kind].coded && !code) throw new ApiError("A code is required", 422);
        try {
            const result = await withTransaction(async (client) => {
                const { id } = await adminCatalogDb.create(client, { kind, name, code });
                await audit(client, actor, { action: "catalog.create", kind, id, reason, after: { name, code: code ?? null }, ip });
                return { id };
            });
            await dropCaches();
            return result;
        } catch (error) {
            if (error?.code === UNIQUE_VIOLATION) throw new ApiError("That name or code already exists", 409);
            throw error;
        }
    },

    update: async ({ actor, kind, id, name, isActive, reason, ip = null }) => {
        if (isActive !== undefined && !CATALOG_KINDS[kind].coded) throw new ApiError("This list cannot be deactivated", 422);
        const result = await withTransaction(async (client) => {
            const before = await adminCatalogDb.lock(client, { kind, id });
            if (!before) throw new ApiError("Not found", 404);
            await adminCatalogDb.update(client, { kind, id, name, isActive });
            const after = await adminCatalogDb.lock(client, { kind, id });
            await audit(client, actor, {
                action: "catalog.update", kind, id, reason, ip,
                before: { name: before.name, active: before.is_active },
                after: { name: after.name, active: after.is_active },
            });
            return after;
        });
        await dropCaches();
        return result;
    },

    /** Only a row no course uses; anything else is deactivated instead. */
    remove: async ({ actor, kind, id, reason, ip = null }) => {
        try {
            await withTransaction(async (client) => {
                const before = await adminCatalogDb.lock(client, { kind, id });
                if (!before) throw new ApiError("Not found", 404);
                if (before.courses > 0) {
                    throw new ApiError(`Used by ${before.courses} course${before.courses === 1 ? "" : "s"}: deactivate it instead`, 409);
                }
                await adminCatalogDb.remove(client, { kind, id });
                await audit(client, actor, { action: "catalog.delete", kind, id, reason, before: { name: before.name, code: before.code }, ip });
            });
        } catch (error) {
            if (error?.code === FOREIGN_KEY_VIOLATION) throw new ApiError("Still referenced by onboarding answers or role skills: deactivate it instead", 409);
            throw error;
        }
        await dropCaches();
        return { id, deleted: true };
    },
};
