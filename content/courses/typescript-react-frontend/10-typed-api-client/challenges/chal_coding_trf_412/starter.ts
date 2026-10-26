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

function toResult(recorded: Recorded): Result<Course[]> {
    // 1. a rejected fetch: timeout or network
    // 2. a status outside 200-299: http, with a message from application/problem+json when there is one
    // 3. 204: an empty list
    // 4. parse the body as unknown, then check it element by element and build new Course objects
    return { ok: false, error: { kind: "network" } };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of recorded fetch outcomes. Output: the Result of toResult for each one, as JSON.
const recordings: Recorded[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(recordings.map((r) => toResult(r))));
