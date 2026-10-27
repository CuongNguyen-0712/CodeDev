import { readFileSync } from "node:fs";

// CodeDev course progress: the bar on the course page showed "NaN%" for a new course and "125%"
// for a learner who double-clicked "Mark as complete". Before touching the code, the team wrote
// the test list below. Write calculateProgress so that every item on it holds.
//
// A lesson is { id: number, required: boolean }. A completion event is { lessonId: number }.
// The data comes from JSON, so the parameters are typed unknown: check them before you use them.
//
// calculateProgress(lessons, completions):
//   1. happy path: percent = completed required lessons * 100 / required lessons,
//      rounded DOWN to a whole number (2 of 3 -> 66): 100 only when every required lesson is done
//   2. optional lessons (required: false) count neither as done nor as total
//   3. a completion for a lesson that is not in the course is ignored, not an error
//   4. the same lesson completed several times (repeated requests) counts once
//   5. no required lessons at all (an empty course, or only optional lessons) -> percent 0, not NaN
//   6. invalid input -> { ok: false, error: "invalid_input" } and nothing else, when:
//        lessons or completions is not an array (null, a string, an object ...)
//        a lesson is not an object, its id is not a positive integer (1, 2, 3 ...)
//          or its required is not a boolean
//        a completion is not an object, or its lessonId is not a positive integer
//      Validate everything first: an invalid completion is an error even for an unknown lesson.
//   Valid result: { ok: true, percent, completedRequired, totalRequired }
//
// Do not change the types or the test runner.

type Progress =
    | { ok: true; percent: number; completedRequired: number; totalRequired: number }
    | { ok: false; error: "invalid_input" };

const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function calculateProgress(lessons: unknown, completions: unknown): Progress {
    const invalid: Progress = { ok: false, error: "invalid_input" };
    if (!Array.isArray(lessons) || !Array.isArray(completions)) return invalid;
    const requiredIds = new Set<number>();
    for (const lesson of lessons) {
        if (!isObject(lesson) || !isPositiveInteger(lesson.id) || typeof lesson.required !== "boolean") return invalid;
        if (lesson.required) requiredIds.add(lesson.id);
    }
    let completed = 0;
    for (const event of completions) {
        if (!isObject(event) || !isPositiveInteger(event.lessonId)) return invalid;
        if (requiredIds.has(event.lessonId)) completed++;
    }
    const totalRequired = requiredIds.size;
    const percent = totalRequired === 0 ? 0 : Math.floor((completed * 100) / totalRequired);
    return { ok: true, percent, completedRequired: completed, totalRequired };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of cases { lessons, completions }. Output: one result per case.
const cases: { lessons: unknown; completions: unknown }[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => calculateProgress(c.lessons, c.completions))));
