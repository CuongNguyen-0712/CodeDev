import { readFileSync } from "node:fs";

// CodeDev course page: public data is the same for everyone and may live in the shared cache; personal
// data (enrollment, progress, the price after the learner's coupon) belongs to one learner and must never
// be stored in it. The shared cache is used by every request of every user, like a CDN or the Next.js
// data cache.
//
// Write renderCoursePage(req, ttl, deps): the page text for one request. The full rules are in the
// challenge description. Do not change the types or the test runner.

type PublicCourse = { id: string; title: string; price: number; lessons: number };
type Enrollment = { enrolled: boolean; progress: number };
type Coupon = { code: string; percent: number; courses: string[] | "all"; expiresAt: number };
type PageRequest = { at: number; userId: string | null; courseId: string };

type SharedCache = {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
};

type Deps = {
    sharedCache: SharedCache;
    loadPublicCourse(courseId: string): PublicCourse | null;
    loadEnrollment(userId: string, courseId: string): Enrollment;
    loadCoupon(userId: string): Coupon | null;
};

type CachedCourse = { course: PublicCourse; storedAt: number };

function getPublicCourse(courseId: string, at: number, ttl: number, deps: Deps): PublicCourse | null {
    const key = `course:${courseId}`;
    const hit = deps.sharedCache.get(key) as CachedCourse | undefined;
    if (hit && at < hit.storedAt + ttl) return hit.course;
    const course = deps.loadPublicCourse(courseId);
    if (course) deps.sharedCache.set(key, { course, storedAt: at } satisfies CachedCourse);
    return course;
}

function couponApplies(coupon: Coupon | null, courseId: string, at: number): coupon is Coupon {
    if (!coupon) return false;
    if (!Number.isInteger(coupon.percent) || coupon.percent < 1 || coupon.percent > 100) return false;
    
    return coupon.courses === "all" || coupon.courses.includes(courseId);
}

function renderCoursePage(req: PageRequest, ttl: number, deps: Deps): string {
    const course = getPublicCourse(req.courseId, req.at, ttl, deps);
    if (!course) return "404 Not Found";
    const head = `${course.title} | ${course.lessons} lessons`;
    const anonymous = `${head} | ${course.price} VND | Enroll`;
    if (req.userId === null) return anonymous;

    const enrollment = deps.loadEnrollment(req.userId, course.id);
    if (enrollment.enrolled) return `${head} | Enrolled, ${enrollment.progress}% complete`;

    const coupon = deps.loadCoupon(req.userId);
    if (!couponApplies(coupon, course.id, req.at)) return anonymous;
    const price = Math.round((course.price * (100 - coupon.percent)) / 100);
    return `${head} | ${price} VND with coupon ${coupon.code} (list ${course.price} VND) | Enroll`;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "ttl": 300, "courses": [PublicCourse], "enrollments": [{ userId, courseId, progress }],
//          "coupons": { "<userId>": Coupon }, "requests": [PageRequest, ...] } with requests in time order.
// Prints, per request, the page and the loads it caused; then the shared cache keys and public loads.
type Input = {
    ttl: number;
    courses: PublicCourse[];
    enrollments: { userId: string; courseId: string; progress: number }[];
    coupons: Record<string, Coupon>;
    requests: PageRequest[];
};

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const shared = new Map<string, string>();
let loads: string[] = [];
let publicLoads = 0;
const deps: Deps = {
    sharedCache: {
        get: (key) => (shared.has(key) ? JSON.parse(shared.get(key) as string) : undefined),
        set: (key, value) => void shared.set(key, JSON.stringify(value)),
    },
    loadPublicCourse(courseId) {
        loads.push(`public:${courseId}`);
        publicLoads++;
        const c = input.courses.find((x) => x.id === courseId);
        return c ? { ...c } : null;
    },
    loadEnrollment(userId, courseId) {
        loads.push(`enrollment:${userId}:${courseId}`);
        const e = input.enrollments.find((x) => x.userId === userId && x.courseId === courseId);
        return e ? { enrolled: true, progress: e.progress } : { enrolled: false, progress: 0 };
    },
    loadCoupon(userId) {
        loads.push(`coupon:${userId}`);
        const c = input.coupons[userId];
        return c ? { ...c } : null;
    },
};
for (const req of input.requests) {
    loads = [];
    const page = renderCoursePage(req, input.ttl, deps);
    console.log(`t=${req.at} ${req.userId ?? "anon"} ${req.courseId}: ${page} [${loads.join(" ")}]`);
}
console.log(`shared cache: ${[...shared.keys()].sort().join(" ") || "(empty)"}; public loads: ${publicLoads}`);
