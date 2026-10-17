import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Onboarding + Free/Premium courses against a real PostgreSQL (DATABASE_URL, migrations
 * 20261017_003..005 applied). Every fixture (users, courses, orders) is created here with a
 * unique tag and removed in afterAll; identity.audit_log rows written by the admin refund stay
 * (the log is append-only by design).
 *
 * Covers the 15 required scenarios (numbers in the test names).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `pt${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

let sql, dbPool, onboardingService, recommendationService, commerceService, adminService,
    challengeService, userService, courseDb, generateSonyflake, webhookPOST, redis, cacheKeys, getUserCacheVersion;

const users = {};
const courses = {};
let challengeId;

const one = async (text, params) => (await sql(text, params)).rows[0];

async function expectDbError(promise, code) {
    let error = null;
    try {
        await promise;
    } catch (e) {
        error = e;
    }
    expect(error, `expected ${code}`).not.toBeNull();
    expect(error.code || error.errorCode).toBe(code);
    return error;
}

async function makeUser(name, points = 0) {
    const id = generateSonyflake();
    const publicId = `${TAG}_${name}`;
    await sql(
        `INSERT INTO identity.users (id, public_id, username, email) VALUES ($1, $2, $3, $4)`,
        [id, publicId, `${TAG}_${name}`, `${TAG}_${name}@test.invalid`]
    );
    await sql(`INSERT INTO profile.info (user_id, surname, name) VALUES ($1, 'Test', $2)`, [id, name.slice(0, 30)]);
    if (points > 0) {
        await sql(`SELECT * FROM public.post_points($1, 'credit', 'adjusted', $2, 'test_seed', $1)`, [id, points]);
    }
    users[name] = { id: String(id), publicId };
    return users[name];
}

async function makeCourse(name, { accessModel = "premium", publishStatus = "published", points = 100, money = 50000 } = {}) {
    const publicId = `${TAG}-${name}`;
    const course = await one(
        `INSERT INTO catalog.course (title, concept, description, instructor, public_id, language_id, category_id, level, access_model, publish_status)
         VALUES ($1, 'test', 'test course', 'Test', $2, (SELECT MIN(id) FROM catalog.language), (SELECT MIN(id) FROM catalog.category), 'intermediate', $3, $4)
         RETURNING id`,
        [`Test ${name} ${TAG}`, publicId, accessModel, publishStatus]
    );
    const mod = await one(`INSERT INTO course.module (course_id, title, order_index) VALUES ($1, 'M1', 1) RETURNING id`, [course.id]);
    const lesson = await one(
        `INSERT INTO course.lesson (module_id, title, order_index, content_type, content_source) VALUES ($1, 'L1', 1, 'sanity', $2) RETURNING id`,
        [mod.id, `${TAG}-${name}-lesson`]
    );
    const challenge = await one(
        `INSERT INTO challenge.challenges (course_id, module_id, lesson_id, name, title, status, difficulty, type, is_published, public_id)
         VALUES ($1, $2, $3, 'q', 'Quiz', 'open', 'easy', 'quiz', true, $4) RETURNING id`,
        [course.id, mod.id, lesson.id, `${TAG}-${name}-ch`]
    );
    if (accessModel === "premium") {
        if (points) {
            await sql(`INSERT INTO commerce.offer (public_id, course_id, price_type, amount) VALUES ($1, $2, 'points', $3)`,
                [`ofr_${TAG}_${name}_p`, course.id, points]);
        }
        if (money) {
            await sql(`INSERT INTO commerce.offer (public_id, course_id, price_type, amount, currency) VALUES ($1, $2, 'money', $3, 'VND')`,
                [`ofr_${TAG}_${name}_m`, course.id, money]);
        }
    }
    courses[name] = { id: String(course.id), publicId, lessonId: String(lesson.id), challengeId: String(challenge.id) };
    return courses[name];
}

const balanceOf = async (user) => Number((await one(`SELECT points FROM profile.info WHERE user_id = $1`, [user.id])).points);
const ledgerCount = async (user, action) =>
    Number((await one(`SELECT COUNT(*)::int AS n FROM profile.point_transaction WHERE user_id = $1 AND action = $2`, [user.id, action])).n);
const key = () => crypto.randomUUID();

async function webhook(event, { secret = process.env.PAYMENT_MOCK_WEBHOOK_SECRET } = {}) {
    const { signatureHeader } = await import("@/services/payments/signature");
    const rawBody = JSON.stringify(event);
    const req = new Request("http://localhost/api/webhooks/payments/mock", {
        method: "POST",
        body: rawBody,
        headers: { "content-type": "application/json", "x-codedev-signature": signatureHeader(secret, rawBody) },
    });
    const res = await webhookPOST(req, { params: Promise.resolve({ provider: "mock" }) });
    return { status: res.status, body: await res.json() };
}

async function paymentOf(orderId) {
    return one(
        `SELECT p.public_id, p.provider_ref, p.amount_minor, p.currency FROM commerce.payment p
         JOIN commerce.orders o ON o.id = p.order_id WHERE o.public_id = $1`,
        [orderId]
    );
}

describe.skipIf(!hasDb)("onboarding + premium courses (PostgreSQL)", () => {
    beforeAll(async () => {
        process.env.PAYMENT_PROVIDER = "mock";
        process.env.PAYMENT_MOCK_WEBHOOK_SECRET = crypto.randomBytes(24).toString("hex");

        ({ sql, dbPool } = await import("@/lib/db"));
        const ready = await one(`SELECT to_regclass('commerce.entitlement') AS t, to_regclass('profile.onboarding') AS o`);
        if (!ready.t || !ready.o) throw new Error("Run `npm run db:migrate` first (migrations 20261017_003..005)");

        ({ onboardingService } = await import("@/services/onboarding.service"));
        ({ recommendationService } = await import("@/services/recommendation.service"));
        ({ commerceService } = await import("@/services/commerce.service"));
        ({ adminService } = await import("@/services/admin.service"));
        ({ challengeService } = await import("@/services/challenge.service"));
        ({ userService } = await import("@/services/user.service"));
        ({ courseDb } = await import("@/db/course.db"));
        ({ generateSonyflake } = await import("@/lib/sonyflake"));
        ({ POST: webhookPOST } = await import("@/app/api/webhooks/payments/[provider]/route"));
        ({ redis } = await import("@/lib/cache"));
        ({ cacheKeys, getUserCacheVersion } = await import("@/lib/cacheKeys"));

        for (const [name, points] of Object.entries({
            fresh: 0, resume: 0, skipper: 0, owner: 300, poor: 10, racer: 150, retry: 300, buyer: 0, failer: 0,
            crash: 300, stranger: 0, cache: 300, admin: 0,
        })) {
            await makeUser(name, points);
        }
        await makeCourse("premium");
        await makeCourse("hidden", { publishStatus: "unpublished" });
        await makeCourse("free", { accessModel: "free", points: 0, money: 0 });
        challengeId = courses.premium.challengeId;
    });

    afterAll(async () => {
        if (!dbPool) return;
        const client = await dbPool.connect();
        try {
            await client.query("BEGIN");
            const userIds = Object.values(users).map((u) => u.id);
            const courseIds = Object.values(courses).map((c) => c.id);
            await client.query(
                `DELETE FROM commerce.payment_event WHERE payment_id IN (
                     SELECT p.id FROM commerce.payment p JOIN commerce.orders o ON o.id = p.order_id WHERE o.user_id = ANY($1::bigint[]))`,
                [userIds]
            );
            await client.query(`DELETE FROM commerce.payment WHERE order_id IN (SELECT id FROM commerce.orders WHERE user_id = ANY($1::bigint[]))`, [userIds]);
            await client.query(`DELETE FROM commerce.orders WHERE user_id = ANY($1::bigint[])`, [userIds]);
            await client.query(`DELETE FROM identity.users WHERE id = ANY($1::bigint[])`, [userIds]);
            await client.query(`DELETE FROM catalog.course WHERE id = ANY($1::bigint[])`, [courseIds]);
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK").catch(() => { });
            throw error;
        } finally {
            client.release();
        }
        const left = await one(`SELECT COUNT(*)::int AS n FROM identity.users WHERE public_id LIKE $1`, [`${TAG}_%`]);
        expect(left.n).toBe(0);
    });

    // ------------------------------------------------------------------ onboarding
    it("1. a new user completes onboarding step by step", async () => {
        const { publicId } = users.fresh;
        expect((await onboardingService.getState({ userId: publicId })).status).toBe("not_started");
        expect(await onboardingService.needsOnboarding({ userId: publicId })).toBe(true);

        let state = await onboardingService.saveStep({ userId: publicId, input: { step: "role", roleCode: "backend_developer" } });
        expect(state).toMatchObject({ status: "in_progress", currentStep: "industry" });
        state = await onboardingService.saveStep({ userId: publicId, input: { step: "industry", industryCodes: ["fintech", "ecommerce"] } });
        expect(state.currentStep).toBe("level_goals");
        state = await onboardingService.saveStep({
            userId: publicId,
            input: { step: "level_goals", experienceLevel: "junior", goalCodes: ["first_job", "build_projects"] },
        });
        expect(state.currentStep).toBe("review");

        state = await onboardingService.complete({ userId: publicId });
        expect(state.status).toBe("completed");
        expect(state.completedAt).toBeTruthy();
        expect(state.preferences).toMatchObject({
            roleCode: "backend_developer",
            experienceLevel: "junior",
            industryCodes: expect.arrayContaining(["fintech", "ecommerce"]),
            goalCodes: expect.arrayContaining(["first_job", "build_projects"]),
        });
    });

    it("1b. completing without the required answers is refused; unknown codes are rejected", async () => {
        const { publicId } = users.resume;
        await expect(onboardingService.complete({ userId: publicId })).rejects.toMatchObject({ status: 422 });
        await expectDbError(onboardingService.saveStep({ userId: publicId, input: { step: "role", roleCode: "astronaut" } }), "CD400");
    });

    it("2. signing in again does not ask again; an unfinished onboarding resumes where it stopped", async () => {
        expect(await onboardingService.needsOnboarding({ userId: users.fresh.publicId })).toBe(false);

        const { publicId } = users.resume;
        await onboardingService.saveStep({ userId: publicId, input: { step: "role", roleCode: "frontend_developer" } });
        await onboardingService.saveStep({ userId: publicId, input: { step: "industry", industryCodes: [] } });
        // Going back to the first step never moves the resume point backwards.
        const state = await onboardingService.saveStep({ userId: publicId, input: { step: "role", roleCode: "fullstack_developer" } });
        expect(state).toMatchObject({ status: "in_progress", currentStep: "level_goals" });
        expect(state.preferences.roleCode).toBe("fullstack_developer");
        expect(await onboardingService.needsOnboarding({ userId: publicId })).toBe(true);
    });

    it("3. skip is stored apart from completed and never overrides completed", async () => {
        const skipped = await onboardingService.skip({ userId: users.skipper.publicId });
        expect(skipped.status).toBe("skipped");
        expect(skipped.skippedAt).toBeTruthy();
        expect(skipped.completedAt).toBeNull();
        expect(await onboardingService.needsOnboarding({ userId: users.skipper.publicId })).toBe(false);

        const completed = await onboardingService.skip({ userId: users.fresh.publicId });
        expect(completed.status).toBe("completed");
    });

    it("4. role and industry can be changed later without touching the status", async () => {
        const { publicId } = users.fresh;
        const state = await onboardingService.updatePreferences({
            userId: publicId,
            input: { roleCode: "data_engineer", industryCodes: ["education"] },
        });
        expect(state.status).toBe("completed");
        expect(state.preferences).toMatchObject({ roleCode: "data_engineer", industryCodes: ["education"], experienceLevel: "junior" });

        const recommendations = await recommendationService.getForUser({ userId: publicId });
        expect(recommendations.basis.role).toBe("Data Engineer");
    });

    it("5. recommendations never include unpublished courses and fall back when nothing matches", async () => {
        const result = await recommendationService.getForUser({ userId: users.skipper.publicId, limit: 12 });
        expect(result.fallback).toBe(true);
        const ids = result.items.map((item) => item.course.id);
        expect(ids).not.toContain(courses.hidden.publicId);
        for (const item of result.items) expect(item.reasons.length).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------ commerce
    it("6. an unpublished course can be neither bought, redeemed, enrolled in nor opened", async () => {
        const { publicId } = users.owner;
        await expectDbError(commerceService.redeem({ userId: publicId, courseId: courses.hidden.publicId, idempotencyKey: key() }), "CD404");
        await expectDbError(commerceService.checkout({ userId: publicId, courseId: courses.hidden.publicId, idempotencyKey: key() }), "CD404");
        await expectDbError(courseDb.postRegister({ userId: publicId, courseId: courses.hidden.publicId }), "CD404");
        await expectDbError(sql(`SELECT public.learning_progress($1, $2)`, [publicId, courses.hidden.publicId]), "CD403");
        expect((await courseDb.getCourseDetails({ courseId: courses.hidden.publicId })).rowCount).toBe(0);
        expect(await balanceOf(users.owner)).toBe(300);
    });

    it("7. a course that is already owned cannot be redeemed again", async () => {
        const { publicId } = users.owner;
        const first = await commerceService.redeem({ userId: publicId, courseId: courses.premium.publicId, idempotencyKey: key() });
        expect(first).toMatchObject({ pointsSpent: 100, balanceAfter: 200, replayed: false });

        await expectDbError(commerceService.redeem({ userId: publicId, courseId: courses.premium.publicId, idempotencyKey: key() }), "CD409");
        await expectDbError(commerceService.checkout({ userId: publicId, courseId: courses.premium.publicId, idempotencyKey: key() }), "CD409");
        expect(await balanceOf(users.owner)).toBe(200);
    });

    it("8. not enough points: nothing is charged, ordered or granted", async () => {
        const user = users.poor;
        await expectDbError(commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() }), "CD402");
        expect(await balanceOf(user)).toBe(10);
        expect((await one(`SELECT COUNT(*)::int AS n FROM commerce.orders WHERE user_id = $1`, [user.id])).n).toBe(0);
        expect((await one(`SELECT COUNT(*)::int AS n FROM commerce.entitlement WHERE user_id = $1`, [user.id])).n).toBe(0);
    });

    it("9. two concurrent redemptions charge once and grant once", async () => {
        const user = users.racer;
        const attempts = await Promise.allSettled([
            commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() }),
            commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() }),
        ]);
        expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
        const rejected = attempts.find((a) => a.status === "rejected");
        expect(rejected.reason.code).toBe("CD409");
        expect(await balanceOf(user)).toBe(50);
        expect(await ledgerCount(user, "debit")).toBe(1);
        expect((await one(`SELECT COUNT(*)::int AS n FROM commerce.entitlement WHERE user_id = $1 AND status = 'active'`, [user.id])).n).toBe(1);
    });

    it("10. a retried request (same key) replays the first result without charging twice", async () => {
        const user = users.retry;
        const idempotencyKey = key();
        const results = await Promise.all([
            commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey }),
            commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey }),
        ]);
        const again = await commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey });
        expect(new Set([...results, again].map((r) => r.orderId)).size).toBe(1);
        expect([...results, again].filter((r) => r.replayed)).toHaveLength(2);
        expect(again.balanceAfter).toBe(200);
        expect(await balanceOf(user)).toBe(200);
        expect(await ledgerCount(user, "debit")).toBe(1);

        // The same key for another course is a conflict, not a silent replay.
        await expectDbError(commerceService.redeem({ userId: user.publicId, courseId: courses.free.publicId, idempotencyKey }), "CD422");
    });

    it("11. a duplicated payment webhook grants access exactly once; bad signatures are rejected", async () => {
        const user = users.buyer;
        const order = await commerceService.checkout({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() });
        expect(order.checkoutUrl).toContain(order.orderId);
        // Redirect / return page do not grant anything.
        expect(await commerceService.getOrder({ userId: user.publicId, orderId: order.orderId })).toMatchObject({ status: "pending", accessGranted: false });

        const payment = await paymentOf(order.orderId);
        const event = {
            id: `evt_${TAG}_ok`,
            type: "payment.succeeded",
            data: { paymentId: payment.public_id, providerRef: payment.provider_ref, amountMinor: Number(payment.amount_minor), currency: "VND" },
        };

        const forged = await webhook(event, { secret: "not-the-real-secret-123456" });
        expect(forged.status).toBe(401);

        const first = await webhook(event);
        const second = await webhook(event);
        expect(first).toMatchObject({ status: 200, body: { result: "granted" } });
        expect(second).toMatchObject({ status: 200, body: { result: "duplicate" } });

        const grants = await one(`SELECT COUNT(*)::int AS n FROM commerce.entitlement WHERE user_id = $1`, [user.id]);
        expect(grants.n).toBe(1);
        expect(await commerceService.getOrder({ userId: user.publicId, orderId: order.orderId })).toMatchObject({ status: "completed", accessGranted: true });

        // Another user cannot read this order (IDOR).
        await expect(commerceService.getOrder({ userId: users.stranger.publicId, orderId: order.orderId })).rejects.toMatchObject({ status: 404 });
    });

    it("11b. a paid amount that differs from the order never grants access", async () => {
        const user = users.failer;
        const order = await commerceService.checkout({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() });
        const payment = await paymentOf(order.orderId);
        const res = await webhook({
            id: `evt_${TAG}_cheap`,
            type: "payment.succeeded",
            data: { paymentId: payment.public_id, providerRef: payment.provider_ref, amountMinor: 1, currency: "VND" },
        });
        expect(res.body.result).toBe("amount_mismatch");
        expect((await one(`SELECT COUNT(*)::int AS n FROM commerce.entitlement WHERE user_id = $1`, [user.id])).n).toBe(0);
    });

    it("12. a failed payment grants nothing; a refund revokes access; a points refund returns the points", async () => {
        const user = users.failer;
        // The pending order of 11b is reused for the same course: fail it.
        const pending = await commerceService.checkout({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() });
        const failedPayment = await paymentOf(pending.orderId);
        const failed = await webhook({
            id: `evt_${TAG}_fail`,
            type: "payment.failed",
            data: { paymentId: failedPayment.public_id, providerRef: failedPayment.provider_ref },
        });
        expect(failed.body.result).toBe("closed");
        expect((await commerceService.getOrder({ userId: user.publicId, orderId: pending.orderId })).status).toBe("failed");

        const retry = await commerceService.checkout({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() });
        expect(retry.orderId).not.toBe(pending.orderId);
        const payment = await paymentOf(retry.orderId);
        const data = { paymentId: payment.public_id, providerRef: payment.provider_ref, amountMinor: Number(payment.amount_minor), currency: "VND" };
        expect((await webhook({ id: `evt_${TAG}_paid`, type: "payment.succeeded", data })).body.result).toBe("granted");
        // A late "failed" after success is ignored.
        expect((await webhook({ id: `evt_${TAG}_late`, type: "payment.failed", data })).body.result).toBe("ignored_out_of_order");

        expect((await webhook({ id: `evt_${TAG}_refund`, type: "payment.refunded", data })).body.result).toBe("revoked");
        expect((await commerceService.getOrder({ userId: user.publicId, orderId: retry.orderId })).status).toBe("refunded");
        expect((await commerceService.getEntitlements({ userId: user.publicId })).courseIds).not.toContain(courses.premium.publicId);

        // Points order refunded by an admin: points back, access revoked, audit row written.
        const owner = users.owner;
        const ownerOrder = (await commerceService.getOrders({ userId: owner.publicId })).orders.find((o) => o.method === "points");
        const refund = await adminService.refundPointsOrder({ actor: { id: users.admin.id }, orderId: ownerOrder.id, reason: "test refund" });
        expect(refund.balanceAfter).toBe(300);
        expect(await balanceOf(owner)).toBe(300);
        await expect(adminService.refundPointsOrder({ actor: { id: users.admin.id }, orderId: ownerOrder.id, reason: "again" }))
            .rejects.toMatchObject({ status: 409 });
        expect((await commerceService.getEntitlements({ userId: owner.publicId })).courseIds).not.toContain(courses.premium.publicId);
        const audit = await one(`SELECT action, reason FROM identity.audit_log WHERE target_id = $1 ORDER BY id DESC LIMIT 1`, [ownerOrder.id]);
        expect(audit).toEqual({ action: "order.refund", reason: "test refund" });
    });

    it("13. a failure between the points debit and the entitlement rolls everything back", async () => {
        const user = users.crash;
        const fn = `test_fail_entitlement_${TAG}`;
        await sql(`CREATE FUNCTION public.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
                   BEGIN RAISE EXCEPTION 'simulated crash'; END; $$`);
        // Sonyflake ids exceed 2^53: keep the exact digits (validated) instead of a JS number.
        if (!/^\d+$/.test(user.id)) throw new Error("unexpected user id");
        await sql(`CREATE TRIGGER ${fn} BEFORE INSERT ON commerce.entitlement FOR EACH ROW
                   WHEN (NEW.user_id = ${user.id}::bigint) EXECUTE FUNCTION public.${fn}()`);
        try {
            await expect(commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() }))
                .rejects.toThrow("simulated crash");
        } finally {
            await sql(`DROP TRIGGER IF EXISTS ${fn} ON commerce.entitlement`);
            await sql(`DROP FUNCTION IF EXISTS public.${fn}()`);
        }
        expect(await balanceOf(user)).toBe(300);
        expect(await ledgerCount(user, "debit")).toBe(0);
        expect((await one(`SELECT COUNT(*)::int AS n FROM commerce.orders WHERE user_id = $1`, [user.id])).n).toBe(0);

        // And the same request succeeds afterwards.
        const ok = await commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() });
        expect(ok.balanceAfter).toBe(200);
    });

    it("14. course, lesson and challenge stay closed without an entitlement", async () => {
        const { publicId } = users.stranger;
        await expectDbError(courseDb.postRegister({ userId: publicId, courseId: courses.premium.publicId }), "CD403");
        await expectDbError(sql(`SELECT public.learning_progress($1, $2)`, [publicId, courses.premium.publicId]), "CD403");
        await expectDbError(courseDb.getLearning({ userId: publicId, lessonId: courses.premium.lessonId }), "CD403");
        await expect(challengeService.getQuizState({ userId: publicId, challengeId }))
            .rejects.toMatchObject({ status: 403 });

        // A free course: enrolling grants the free entitlement, then the content opens.
        await courseDb.postRegister({ userId: publicId, courseId: courses.free.publicId });
        const progress = await sql(`SELECT public.learning_progress($1, $2) AS p`, [publicId, courses.free.publicId]);
        expect(progress.rows[0].p.id).toBe(courses.free.publicId);
        const entitlement = await one(
            `SELECT e.source FROM commerce.entitlement e WHERE e.user_id = $1 AND e.course_id = $2`,
            [users.stranger.id, courses.free.id]
        );
        expect(entitlement.source).toBe("free");

        // Withdrawing closes the lessons again (enrolment is required as well).
        await courseDb.postWithdraw({ userId: publicId, courseId: courses.free.publicId });
        await expectDbError(courseDb.getLearning({ userId: publicId, lessonId: courses.free.lessonId }), "CD403");
    });

    it("15. balances are never served stale from Redis after a redemption", async () => {
        const user = users.cache;
        const before = await userService.getMe(user.publicId);
        expect(Number(before.points)).toBe(300);

        const version = await getUserCacheVersion(user.publicId);
        const cached = await redis.get(cacheKeys.userMe(user.publicId, version));
        const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
        if (parsed) expect(parsed).not.toHaveProperty("points");

        await commerceService.redeem({ userId: user.publicId, courseId: courses.premium.publicId, idempotencyKey: key() });
        const after = await userService.getMe(user.publicId);
        expect(Number(after.points)).toBe(200);
        expect((await commerceService.getWallet({ userId: user.publicId })).balance).toBe(200);
    });

    it("ledger is append-only and the cache matches it", async () => {
        await expect(sql(`UPDATE profile.point_transaction SET amount = 1 WHERE user_id = $1`, [users.owner.id]))
            .rejects.toMatchObject({ code: "CD400" });
        await expect(sql(`DELETE FROM profile.point_transaction WHERE user_id = $1`, [users.owner.id]))
            .rejects.toMatchObject({ code: "CD400" });

        const drift = await sql(`SELECT * FROM profile.point_balance_drift WHERE user_id = ANY($1::bigint[])`, [Object.values(users).map((u) => u.id)]);
        expect(drift.rows).toEqual([]);
    });
});
