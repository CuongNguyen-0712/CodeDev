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
    // [ ] Check one course and keep only the known fields
}

function parseCourses(json: unknown): Result<Course[]> {
    // [ ] Check every element of the array
}

function httpMessage(status: number, headers: Record<string, string>, body: string): string {
    // [ ] A message for a failed HTTP status
}

function toResult(recorded: Recorded): Result<Course[]> {
    // [ ] A request that never got a response
    const { status, headers, body } = recorded;
    // [ ] Failed statuses and the empty 204
    // [ ] Read the body as JSON, then check it
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of recorded fetch outcomes. Output: the Result of toResult for each one, as JSON.
const recordings: Recorded[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(recordings.map((r) => toResult(r))));
