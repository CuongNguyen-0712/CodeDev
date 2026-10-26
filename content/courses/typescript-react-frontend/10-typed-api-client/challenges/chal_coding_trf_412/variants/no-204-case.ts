import { readFileSync } from "node:fs";

// GET https://api.codedev.test/courses, as the catalog's API layer sees it.
// The page used to do `return (await res.json()) as Course[]`. When the API renamed "rating" to
// "averageRating", the cast still compiled, the list rendered, and CourseCard crashed later with
// "Cannot read properties of undefined (reading 'toFixed')".
//
// Write toResult(recorded): turn what fetch gave us into a Result the UI can switch on.
// The full rules are in the challenge description. Do not change the types or the test runner.

type Category = "react" | "node" | "sql" | "python" | "devops";
type Level = "beginner" | "intermediate" | "advanced";

type Course = {
    id: string;
    title: string;
    category: Category;
    level: Level;
    rating: number;
    enrolled: number;
    publishedAt: string;
};

type ApiError =
    | { kind: "network" }
    | { kind: "timeout" }
    | { kind: "http"; status: number; message: string }
    | { kind: "invalid-response"; reason: string };

type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// What fetch gave us, recorded: a response (status, headers, body text), or the error it rejected with.
type Recorded =
    | { status: number; headers: Record<string, string>; body: string }
    | { error: { name: string; message: string } };

const CATEGORIES: readonly Category[] = ["react", "node", "sql", "python", "devops"];
const LEVELS: readonly Level[] = ["beginner", "intermediate", "advanced"];

const isCategory = (v: unknown): v is Category => CATEGORIES.some((c) => c === v);
const isLevel = (v: unknown): v is Level => LEVELS.some((l) => l === v);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function header(headers: Record<string, string>, name: string): string | undefined {
    const found = Object.keys(headers).find((k) => k.toLowerCase() === name);
    return found === undefined ? undefined : headers[found];
}

/** One element of the array: a Course with only the known fields, or the reason it is invalid. */
function parseCourse(value: unknown, i: number): Course | string {
    if (!isRecord(value)) return `courses[${i}] is not an object`;
    const { id, title, category, level, rating, enrolled, publishedAt } = value;
    if (typeof id !== "string" || id === "") return `courses[${i}].id is invalid`;
    if (typeof title !== "string") return `courses[${i}].title is invalid`;
    if (!isCategory(category)) return `courses[${i}].category is invalid`;
    if (!isLevel(level)) return `courses[${i}].level is invalid`;
    if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 5) return `courses[${i}].rating is invalid`;
    if (typeof enrolled !== "number" || !Number.isInteger(enrolled) || enrolled < 0) return `courses[${i}].enrolled is invalid`;
    if (typeof publishedAt !== "string") return `courses[${i}].publishedAt is invalid`;
    return { id, title, category, level, rating, enrolled, publishedAt };
}

function parseCourses(json: unknown): Result<Course[]> {
    if (!Array.isArray(json)) return { ok: false, error: { kind: "invalid-response", reason: "expected an array" } };
    const data: Course[] = [];
    for (let i = 0; i < json.length; i++) {
        const course = parseCourse(json[i], i);
        if (typeof course === "string") return { ok: false, error: { kind: "invalid-response", reason: course } };
        data.push(course);
    }
    return { ok: true, data };
}

function httpMessage(status: number, headers: Record<string, string>, body: string): string {
    const type = header(headers, "content-type") ?? "";
    if (type.toLowerCase().startsWith("application/problem+json")) {
        try {
            const problem: unknown = JSON.parse(body);
            if (isRecord(problem)) {
                if (typeof problem.detail === "string") return problem.detail;
                if (typeof problem.title === "string") return problem.title;
            }
        } catch {
            // a broken problem body falls back to the status
        }
    }
    return `HTTP ${status}`;
}

function toResult(recorded: Recorded): Result<Course[]> {
    if ("error" in recorded) {
        return { ok: false, error: recorded.error.name === "TimeoutError" ? { kind: "timeout" } : { kind: "network" } };
    }
    const { status, headers, body } = recorded;
    if (status < 200 || status > 299) {
        return { ok: false, error: { kind: "http", status, message: httpMessage(status, headers, body) } };
    }
    if (body.trim() === "") return { ok: false, error: { kind: "invalid-response", reason: "empty body" } };
    let json: unknown;
    try {
        json = JSON.parse(body);
    } catch {
        return { ok: false, error: { kind: "invalid-response", reason: "body is not JSON" } };
    }
    return parseCourses(json);
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of recorded fetch outcomes. Output: the Result of toResult for each one, as JSON.
const recordings: Recorded[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(recordings.map((r) => toResult(r))));
