import { readFileSync } from "node:fs";

// Spot the AI Mistake: the course page that never updates. The request sent to an AI coding assistant was:
//   "Cache the course page so it is fast."
// The assistant cached the course data with a tag and a one-hour lifetime, kept the two server actions of
// the instructor dashboard, and the pull request was merged: the page was fast and looked right in review.
//
// Instructors now report that the course page keeps the old title and the old price after they save,
// for up to an hour. Learners saw 249000 VND on the page and 199000 VND at checkout.
//
// Fix the assistant's code so that an instructor who saves a title or a price sees the new value on the
// very next read of that course page, while reads stay cached: no extra database reads for other
// courses, and none for this course until something changes or the lifetime ends.
// Do not change the database, the mini cache or the test runner.

type Course = { id: string; title: string; price: number };
type ActionResult = { ok: true } | { ok: false; error: string };

// ------------------------------------------------------------------ database (do not change)
const db = {
    reads: 0,
    courses: new Map<string, Course>(),
    findCourse(id: string): Course | null {
        db.reads++;
        const c = db.courses.get(id);
        return c ? { ...c } : null;
    },
    updateCourse(id: string, patch: Partial<Omit<Course, "id">>): void {
        const c = db.courses.get(id);
        if (c) db.courses.set(id, { ...c, ...patch });
    },
};

// ------------------------------------------------------------------ the assistant's code
// lib/catalog.ts: the course page data, cached for an hour and tagged with the course id.
const getCourse = cached((id: string) => db.findCourse(id), {
    keyParts: ["getCourse"],
    tags: (id: string) => [`course:${id}`],
    revalidate: 3600,
});

// app/course/[slug]/page.tsx (simplified): what the learner sees.
function renderCoursePage(id: string): string {
    const course = getCourse(id);
    return course ? `${course.title} - ${course.price} VND` : "404 Not Found";
}

// app/instructor/courses/[id]/actions.ts: "use server"
function saveCourseDetails(id: string, patch: { title?: string }): ActionResult {
    if (!db.courses.has(id)) return { ok: false, error: "course not found" };
    if (patch.title !== undefined && patch.title.trim() === "") return { ok: false, error: "title is required" };
    db.updateCourse(id, patch);
    revalidateTag(`course:${id}`, "max");
    return { ok: true };
}

function changeCoursePrice(id: string, price: number): ActionResult {
    if (!db.courses.has(id)) return { ok: false, error: "course not found" };
    if (!Number.isInteger(price) || price < 0) return { ok: false, error: "invalid price" };
    db.updateCourse(id, { price });
    revalidateTag(`course:${id}`, "max");
    return { ok: true };
}

// ------------------------------------------------------------------ mini Next.js data cache (do not change)
// A model of "use cache" + cacheTag + cacheLife on a fake clock (seconds).
//   cached(fn, { keyParts, tags, revalidate }) returns a function that reads through the cache:
//     MISS  no entry, or the entry was expired by updateTag: run fn, store the result, return it.
//     HIT   the entry is younger than `revalidate` seconds: return it, fn does not run.
//     STALE the entry is older, or was marked stale by revalidateTag: return the OLD value now, then
//           run fn in the background and store the fresh result for the next read.
//   updateTag(tag)              like next/cache updateTag in a Server Action: entries stored with this tag
//                               expire now, so the next read is a MISS and waits for fresh data.
//   revalidateTag(tag, "max")   like next/cache revalidateTag(tag, "max"): entries are marked stale, so the
//                               next read is STALE (old value) and refreshes in the background.
// Tags are compared as whole strings. A tag that no entry carries does nothing, silently.
type Entry = { value: unknown; tags: string[]; storedAt: number; revalidate: number; expired: boolean; stale: boolean };
const cache = { now: 0, entries: new Map<string, Entry>(), lastStatus: "" };

function cached<A extends string, R>(
    fn: (arg: A) => R,
    options: { keyParts: string[]; tags: (arg: A) => string[]; revalidate: number },
): (arg: A) => R {
    return (arg: A): R => {
        const key = [...options.keyParts, arg].join("|");
        const entry = cache.entries.get(key);
        const store = (): R => {
            const value = fn(arg);
            cache.entries.set(key, { value, tags: options.tags(arg), storedAt: cache.now, revalidate: options.revalidate, expired: false, stale: false });
            return value;
        };
        if (!entry || entry.expired) {
            cache.lastStatus = "MISS";
            return store();
        }
        if (entry.stale || cache.now - entry.storedAt >= entry.revalidate) {
            cache.lastStatus = "STALE";
            store();
            return entry.value as R;
        }
        cache.lastStatus = "HIT";
        return entry.value as R;
    };
}

function updateTag(tag: string): void {
    for (const entry of cache.entries.values()) if (entry.tags.includes(tag)) entry.expired = true;
}

function revalidateTag(tag: string, profile: "max"): void {
    for (const entry of cache.entries.values()) if (entry.tags.includes(tag) && profile === "max") entry.stale = true;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "courses": [Course, ...], "steps": [...] }. Steps:
//   { "read": "42" }                        a learner opens the course page
//   { "edit": "42", "title": "New title" }  the instructor saves the details form
//   { "price": "42", "amount": 199000 }     the instructor changes the price
//   { "advance": 600 }                      the fake clock moves forward (seconds)
// Prints one line per step, then the number of database reads.
type Step = { read?: string; edit?: string; title?: string; price?: string; amount?: number; advance?: number };

const input: { courses: Course[]; steps: Step[] } = JSON.parse(readFileSync(0, "utf8"));
for (const c of input.courses) db.courses.set(c.id, { ...c });
const show = (r: ActionResult): string => (r.ok ? "ok" : r.error);
for (const step of input.steps) {
    if (step.read !== undefined) {
        const page = renderCoursePage(step.read);
        console.log(`read ${step.read}: "${page}" (${cache.lastStatus})`);
    } else if (step.edit !== undefined) {
        console.log(`edit ${step.edit}: ${show(saveCourseDetails(step.edit, step.title === undefined ? {} : { title: step.title }))}`);
    } else if (step.price !== undefined) {
        console.log(`price ${step.price}: ${show(changeCoursePrice(step.price, step.amount ?? NaN))}`);
    } else if (step.advance !== undefined) {
        cache.now += step.advance;
        console.log(`+${step.advance}s`);
    }
}
console.log(`database reads: ${db.reads}`);
