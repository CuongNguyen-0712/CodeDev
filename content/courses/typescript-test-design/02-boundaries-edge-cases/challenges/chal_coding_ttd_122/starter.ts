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

function calculateProgress(lessons: unknown, completions: unknown): Progress {
    return { ok: true, percent: 0, completedRequired: 0, totalRequired: 0 };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of cases { lessons, completions }. Output: one result per case.
const cases: { lessons: unknown; completions: unknown }[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => calculateProgress(c.lessons, c.completions))));
