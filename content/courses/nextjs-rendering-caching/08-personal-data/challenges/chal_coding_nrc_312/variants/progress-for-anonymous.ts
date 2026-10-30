import { readFileSync } from "node:fs";

// CodeDev course page /courses/[slug]: one shared, cached syllabus plus the signed-in learner's progress.
//
// deps.cachedCourse(slug) reads the syllabus from the shared cache. It returns the SAME object to every
// request, for every learner: treat it as read-only.
// deps.progress(userId, slug) reads one learner's progress from the database. It is personal: call it
// only for a signed-in learner (session is not null), and only with that learner's own userId.
//
// buildCoursePage(slug, session, deps) returns a NEW view object for this request:
//   title    the course title
//   lessons  one { id, title, done } per lesson of the course, in course order;
//            done is true only when the lesson id is in this learner's completedLessonIds
//   percent  done lessons of the course / lessons of the course x 100, rounded with Math.round;
//            0 for an anonymous visitor and for a course without lessons
//   cta      "Sign in to enroll" for an anonymous visitor (session null),
//            "Continue" for a learner whose progress says enrolled, "Enroll" otherwise
// completedLessonIds may contain ids of lessons that were removed from the course: ignore them.
// Never write to the shared course object or to its lessons.
// Do not change the types or the test runner.

type Lesson = { id: string; title: string };
type Course = { slug: string; title: string; lessons: Lesson[] };
type Session = { userId: string } | null;
type Progress = { enrolled: boolean; completedLessonIds: string[] };
type LessonView = { id: string; title: string; done: boolean };
type Cta = "Enroll" | "Continue" | "Sign in to enroll";
type CoursePageView = { title: string; lessons: LessonView[]; percent: number; cta: Cta };
type Deps = {
    cachedCourse(slug: string): Course;
    progress(userId: string, slug: string): Progress;
};

function buildCoursePage(slug: string, session: Session, deps: Deps): CoursePageView {
    const course = deps.cachedCourse(slug);
    // anonymous visitors get the empty progress of the "anonymous" id
    const progress = deps.progress(session?.userId ?? "anonymous", slug);
    const completed = new Set(progress.completedLessonIds);
    const lessons = course.lessons.map((l) => ({ id: l.id, title: l.title, done: completed.has(l.id) }));
    const done = lessons.filter((l) => l.done).length;
    const percent = lessons.length === 0 ? 0 : Math.round((done / lessons.length) * 100);
    const cta: Cta = session === null ? "Sign in to enroll" : progress.enrolled ? "Continue" : "Enroll";
    return { title: course.title, lessons, percent, cta };
}

/ ---------------------------------------------------------------- test runner (do not change)
type TestInput = {
    course: Course;
    progress: Record<string, Progress>;
    requests: { userId: string | null }[];
};
const input: TestInput = JSON.parse(readFileSync(0, "utf8"));
const shared: Course = JSON.parse(JSON.stringify(input.course));
const snapshot = JSON.stringify(shared);
let current: Session = null;
let progressCalls = 0;
let anonymousCalls = 0;
let otherUserCalls = 0;
const deps: Deps = {
    cachedCourse: (slug) => {
        if (slug !== shared.slug) throw new Error(`unknown course ${slug}`);
        return shared;
    },
    progress: (userId, slug) => {
        progressCalls++;
        if (current === null) anonymousCalls++;
        else if (current.userId !== userId) otherUserCalls++;
        const p = input.progress[userId] ?? { enrolled: false, completedLessonIds: [] };
        return JSON.parse(JSON.stringify(p));
    },
};
for (const request of input.requests) {
    current = request.userId === null ? null : { userId: request.userId };
    const view = buildCoursePage(shared.slug, current, deps);
    const lessons = view.lessons.map((l) => `${l.done ? "[x]" : "[ ]"} ${l.title}`).join(" ");
    console.log(`${request.userId ?? "anonymous"} | ${view.title} | ${lessons || "no lessons"} | ${view.percent}% | ${view.cta}`);
}
console.log(`shared course unchanged: ${JSON.stringify(shared) === snapshot ? "yes" : "no"}`);
console.log(`progress calls: ${progressCalls} (anonymous: ${anonymousCalls}, other user: ${otherUserCalls})`);
