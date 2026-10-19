import { adminDb } from "@/db/admin.db";
import { withTransaction } from "@/lib/dbTransaction";
import { ApiError } from "@/lib/error/apiError";
import { redis } from "@/lib/cache";
import { cacheKeys, invalidateUserCache } from "@/lib/cacheKeys";
import { publishToUser } from "@/lib/pusher";
import { events, progressReasons } from "@/lib/realtime";

/**
 * Admin / course manager operations. The caller has already passed `requirePermission`
 * (permissions read from the database). Every write and its identity.audit_log row commit in one
 * transaction; catalog caches are dropped afterwards (prices / visibility are catalog data).
 */

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

function mapCourse(row) {
    return {
        id: row.id,
        title: row.title,
        level: row.level,
        publishStatus: row.publish_status,
        publishedAt: row.published_at,
        accessModel: row.access_model,
        courseType: row.course_type,
        students: row.students,
        lessons: row.lessons,
        modules: row.modules,
        languageName: row.language_name,
        categoryName: row.category_name,
        skills: row.skills,
        roleCodes: row.role_codes,
        industryCodes: row.industry_codes,
        goalCodes: row.goal_codes,
        prerequisiteIds: row.prerequisite_ids,
        offers: (row.offers || []).map((o) => ({ ...o, amount: toNumber(o.amount) })),
        updatedAt: row.updated_at,
    };
}

async function dropCatalogCaches(courseId) {
    try {
        await redis.del(cacheKeys.courseDetailsPublic(courseId), cacheKeys.courseFilterOptions());
    } catch (error) {
        console.error("[admin] cache invalidation failed:", error?.message);
    }
}

async function withCourse(actor, courseId, work) {
    const result = await withTransaction(async (client) => {
        const before = await adminDb.lockCourse(client, courseId);
        if (!before) throw new ApiError("Course not found", 404);
        const audit = await work(client, before);
        const after = await adminDb.lockCourse(client, courseId);
        await adminDb.audit(client, {
            actorId: actor.id,
            targetType: "course",
            targetId: courseId,
            before: mapCourse(before),
            after: mapCourse(after),
            ...audit,
        });
        return mapCourse(after);
    });
    await dropCatalogCaches(courseId);
    return result;
}

export const adminService = {
    listCourses: async () => {
        const [courses, taxonomy] = await Promise.all([adminDb.listCourses(), adminDb.getTaxonomy()]);
        const pick = (kind) => taxonomy.rows.filter((row) => row.kind === kind).map(({ code, name }) => ({ code, name }));
        return {
            courses: courses.rows.map(mapCourse),
            taxonomy: { skills: pick("skill"), roles: pick("role"), industries: pick("industry"), goals: pick("goal") },
        };
    },

    updateCourse: async ({ actor, courseId, input }) => {
        return withCourse(actor, courseId, async (client, course) => {
            if (input.accessModel === "free" && (course.offers || []).length > 0) {
                throw new ApiError("Remove the course prices before making it free.", 409, { code: "HAS_OFFERS" });
            }
            await adminDb.updateCourseColumns(client, course.db_id, input);
            if (input.skills) {
                await adminDb.replaceCourseSet(client, course.db_id, "skill", input.skills.map((s) => s.code),
                    new Map(input.skills.map((s) => [s.code, s.weight])));
            }
            if (input.roleCodes) await adminDb.replaceCourseSet(client, course.db_id, "role", input.roleCodes);
            if (input.industryCodes) await adminDb.replaceCourseSet(client, course.db_id, "industry", input.industryCodes);
            if (input.goalCodes) await adminDb.replaceCourseSet(client, course.db_id, "goal", input.goalCodes);
            if (input.prerequisiteIds) await adminDb.replacePrerequisites(client, course.db_id, input.prerequisiteIds);
            return { action: "course.update", reason: input.reason || null };
        });
    },

    setPublishStatus: async ({ actor, courseId, status, reason }) => {
        return withCourse(actor, courseId, async (client, course) => {
            if (status === "published" && course.access_model === "premium" && (course.offers || []).length === 0) {
                throw new ApiError("A premium course needs a price before it is published.", 409, { code: "NO_OFFER" });
            }
            await adminDb.setPublishStatus(client, course.db_id, status);
            return { action: `course.${status}`, reason: reason || null };
        });
    },

    setOffer: async ({ actor, courseId, input }) => {
        return withCourse(actor, courseId, async (client, course) => {
            if (course.access_model !== "premium") {
                throw new ApiError("Only premium courses have prices.", 409, { code: "NOT_PREMIUM" });
            }
            await adminDb.deactivateOffer(client, course.db_id, input.priceType);
            await adminDb.insertOffer(client, {
                courseDbId: course.db_id,
                priceType: input.priceType,
                amount: input.amount,
                currency: input.priceType === "money" ? input.currency : null,
                actorId: actor.id,
            });
            return { action: "offer.set", reason: input.reason || null };
        });
    },

    removeOffer: async ({ actor, courseId, priceType, reason }) => {
        return withCourse(actor, courseId, async (client, course) => {
            const removed = await adminDb.deactivateOffer(client, course.db_id, priceType);
            if (removed.rowCount === 0) throw new ApiError("This course has no such price.", 404);
            return { action: "offer.remove", reason: reason || null };
        });
    },

    /** Credit (amount > 0) or debit (amount < 0) a user's points, with a reason, exactly once per key. */
    adjustPoints: async ({ actor, input, ip }) => {
        const result = await withTransaction(async (client) => {
            const user = await adminDb.findUserForUpdate(client, input.userId);
            if (!user) throw new ApiError("User not found", 404);

            const entry = await adminDb.postPoints(client, {
                userDbId: user.id,
                action: input.amount > 0 ? "credit" : "debit",
                entryType: "adjusted",
                amount: Math.abs(input.amount),
                sourceType: "admin_adjustment",
                // Unique per adjustment: the ledger row id is not known yet, so use a time-based id.
                sourceId: Date.now() * 1000 + Math.floor(Math.random() * 1000),
                idempotencyKey: `adjust:${input.idempotencyKey}`,
                actorId: actor.id,
                reason: input.reason,
            });

            if (entry.created) {
                await adminDb.audit(client, {
                    actorId: actor.id,
                    action: "points.adjust",
                    targetType: "user",
                    targetId: input.userId,
                    reason: input.reason,
                    before: { points: toNumber(user.points) },
                    after: { points: toNumber(entry.balance_after), amount: input.amount },
                    ip,
                });
            }

            return { userId: input.userId, balanceAfter: toNumber(entry.balance_after), replayed: !entry.created };
        });

        await invalidateUserCache(input.userId);
        return result;
    },

    /** Add (amount > 0) or remove (amount < 0, floored at 0) a user's EXP, with a reason, exactly once per key. */
    adjustExperience: async ({ actor, input, ip }) => {
        const result = await withTransaction(async (client) => {
            const user = await adminDb.findUserForUpdate(client, input.userId);
            if (!user) throw new ApiError("User not found", 404);

            const entry = await adminDb.postExp(client, {
                userDbId: user.id,
                amount: input.amount,
                idempotencyKey: `adjust-exp:${input.idempotencyKey}`,
                actorId: actor.id,
                reason: input.reason,
            });

            if (entry.created) {
                await adminDb.audit(client, {
                    actorId: actor.id,
                    action: "experience.adjust",
                    targetType: "user",
                    targetId: input.userId,
                    reason: input.reason,
                    before: { exp: toNumber(user.exp), level: user.exp_level },
                    after: { exp: toNumber(entry.exp_after), level: entry.new_level, amount: entry.awarded },
                    ip,
                });
            }

            return {
                userId: input.userId,
                expAfter: toNumber(entry.exp_after),
                level: entry.new_level,
                replayed: !entry.created,
            };
        });

        await invalidateUserCache(input.userId);
        return result;
    },

    /**
     * Refunds a points order: points back (ledger 'refunded'), order refunded, entitlement
     * revoked. Money orders are refunded at the provider; its webhook revokes access.
     */
    refundPointsOrder: async ({ actor, orderId, reason, ip }) => {
        const result = await withTransaction(async (client) => {
            const order = await adminDb.lockOrder(client, orderId);
            if (!order) throw new ApiError("Order not found", 404);
            if (order.method !== "points") {
                throw new ApiError("Money orders are refunded through the payment provider.", 409, { code: "PROVIDER_REFUND_REQUIRED" });
            }
            if (order.status !== "completed") {
                throw new ApiError(`Only completed orders can be refunded (this one is ${order.status}).`, 409, { code: "ORDER_NOT_REFUNDABLE" });
            }

            const entry = await adminDb.postPoints(client, {
                userDbId: order.user_id,
                action: "credit",
                entryType: "refunded",
                amount: toNumber(order.points_total),
                sourceType: "order",
                sourceId: order.id,
                idempotencyKey: `refund:${order.public_id}`,
                orderId: order.id,
                actorId: actor.id,
                reason,
            });
            await adminDb.markOrderRefunded(client, order.id);
            const revoked = await adminDb.revokeEntitlementsOfOrder(client, order.id, "refund");
            await adminDb.audit(client, {
                actorId: actor.id,
                action: "order.refund",
                targetType: "order",
                targetId: order.public_id,
                reason,
                before: { status: order.status },
                after: { status: "refunded", pointsReturned: toNumber(order.points_total), revoked: revoked.rowCount },
                ip,
            });

            return { orderId: order.public_id, userId: order.user_public_id, balanceAfter: toNumber(entry.balance_after) };
        });

        await invalidateUserCache(result.userId);
        publishToUser(result.userId, events.PROGRESS_UPDATED, { courseId: null, reason: progressReasons.OWNERSHIP_CHANGED });
        return { orderId: result.orderId, balanceAfter: result.balanceAfter };
    },

    grantEntitlement: async ({ actor, input, ip }) => {
        const result = await withTransaction(async (client) => {
            const user = await adminDb.findUserForUpdate(client, input.userId);
            if (!user) throw new ApiError("User not found", 404);
            const course = await adminDb.lockCourse(client, input.courseId);
            if (!course || course.publish_status === "archived") throw new ApiError("Course not found", 404);

            const granted = await adminDb.grantEntitlement(client, {
                userDbId: user.id,
                courseDbId: course.db_id,
                expiresAt: input.expiresAt || null,
                actorId: actor.id,
            });
            if (granted.rowCount === 0) throw new ApiError("The user already has access to this course.", 409, { code: "ALREADY_OWNED" });

            await adminDb.audit(client, {
                actorId: actor.id,
                action: "entitlement.grant",
                targetType: "user",
                targetId: input.userId,
                reason: input.reason,
                after: { courseId: input.courseId, entitlementId: granted.rows[0].public_id, expiresAt: input.expiresAt || null },
                ip,
            });
            return { entitlementId: granted.rows[0].public_id };
        });

        await invalidateUserCache(input.userId);
        publishToUser(input.userId, events.PROGRESS_UPDATED, { courseId: input.courseId, reason: progressReasons.OWNERSHIP_CHANGED });
        return result;
    },

    revokeEntitlement: async ({ actor, input, ip }) => {
        const result = await withTransaction(async (client) => {
            const revoked = await adminDb.revokeEntitlement(client, input.entitlementId, "admin");
            if (revoked.rowCount === 0) throw new ApiError("Active entitlement not found", 404);
            const row = revoked.rows[0];
            await adminDb.audit(client, {
                actorId: actor.id,
                action: "entitlement.revoke",
                targetType: "user",
                targetId: row.user_public_id,
                reason: input.reason,
                before: { entitlementId: row.public_id, courseId: row.course_public_id, source: row.source, status: "active" },
                after: { status: "revoked" },
                ip,
            });
            return { userId: row.user_public_id, courseId: row.course_public_id };
        });

        await invalidateUserCache(result.userId);
        publishToUser(result.userId, events.PROGRESS_UPDATED, { courseId: result.courseId, reason: progressReasons.OWNERSHIP_CHANGED });
        return { revoked: true };
    },

    findUsers: async ({ query }) => {
        const { rows } = await adminDb.findUsers({ query });
        return rows.map((row) => ({ ...row, points: toNumber(row.points) }));
    },

    getUserEntitlements: async ({ userId }) => {
        const { rows } = await adminDb.getUserEntitlements({ userId });
        return rows;
    },

    listOrders: async () => {
        const { rows } = await adminDb.listOrders({ limit: 50 });
        return rows.map((row) => ({ ...row, amount_minor: toNumber(row.amount_minor), points_total: toNumber(row.points_total) }));
    },

    listAudit: async () => {
        const { rows } = await adminDb.listAudit({ limit: 50 });
        return rows;
    },
};
