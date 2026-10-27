import { readFileSync } from "node:fs";

// CodeDev catalog: after an edit, revalidate exactly the cached data and pages the edit made wrong.
// The course page /course/<slug> reads the tagged data course:<id> (everything about the course) and
// instructor:<id> (the instructor's name). The catalog /courses and the category pages show course
// cards (title, price, slug, category, instructor name) of published courses only, cached under the
// tags courses:list and courses:category:<category>. The category sidebar of /courses (categories with
// course counts) comes from an untagged query, so only the path /courses refreshes it.
//
// Write revalidationTargets(catalog, event): the tags to pass to revalidateTag and the paths to pass to
// revalidatePath for one event, each deduplicated and sorted. The full rules are in the challenge
// description. The catalog is the state before the event. Do not change the types or the test runner.

type Course = {
    id: string;
    slug: string;
    title: string;
    description: string;
    price: number;
    category: string;
    instructorId: string;
    published: boolean;
};

type CourseChanges = { title?: string; description?: string; price?: number; category?: string; slug?: string };

type DomainEvent =
    | { type: "course_updated"; courseId: string; changes: CourseChanges }
    | { type: "price_changed"; courseId: string; price: number }
    | { type: "lesson_added"; courseId: string; lessonId: string }
    | { type: "course_published"; courseId: string }
    | { type: "course_unpublished"; courseId: string }
    | { type: "instructor_renamed"; instructorId: string; name: string };

type Targets = { tags: string[]; paths: string[] };

function revalidationTargets(catalog: Course[], event: DomainEvent): Targets {
    // 1. instructor_renamed has no courseId: handle it first
    // 2. find the course; an unknown course gives nothing to revalidate
    // 3. for an edit, keep only the fields whose value really changes
    // 4. collect tags and paths in Sets, then return them sorted
    return { tags: [], paths: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "catalog": [Course, ...], "events": [DomainEvent, ...] }. Every event is checked on its own
// against the same catalog. Prints one { tags, paths } object per event, as a JSON array.
const input: { catalog: Course[]; events: DomainEvent[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(input.events.map((e) => revalidationTargets(input.catalog, e))));
