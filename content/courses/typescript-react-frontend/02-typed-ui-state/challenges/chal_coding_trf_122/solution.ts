import { readFileSync } from "node:fs";

// CodeDev course catalog: the page used three booleans (isLoading, isError, data) and showed
// "No courses found" while it was still loading and a blank page when the API failed.
// The query hook gives you a snapshot of the request; turn it into exactly one UI state.
//
// deriveUiState(snapshot), checked in this order:
//   1. status "pending" (no response yet)       -> { kind: "loading" }
//   2. status "error"                           -> { kind: "error", message, canRetry }
//        error.status 401                       -> message "Your session has expired. Sign in again.", canRetry false
//        error.status 0 (network error or timeout), 408, 429 or 500-599, or no error object at all
//                                               -> message "Could not load courses. Try again.", canRetry true
//        any other status (400, 403, 404, ...)  -> message = error.message from the API, canRetry false
//   3. status "success" with no courses (data missing or an empty array)
//                                               -> { kind: "empty", query } with the query trimmed
//   4. status "success" with courses            -> { kind: "success", courses: data, refreshing: isFetching }
//        (a background refetch keeps the list on screen and only sets refreshing)
//
// Do not change the types or the test runner.

type Course = {
    id: string;
    title: string;
    category: "react" | "node" | "sql" | "python" | "devops";
    level: "beginner" | "intermediate" | "advanced";
    rating: number;
    enrolled: number;
    publishedAt: string;
};

type ApiError = { status: number; message: string };

type RequestSnapshot = {
    status: "pending" | "error" | "success";
    isFetching: boolean; // true while a request for this query is in flight
    query: string; // the search text the learner typed
    data?: Course[]; // the last successful response, kept during a refetch
    error?: ApiError;
};

type CatalogUiState =
    | { kind: "loading" }
    | { kind: "error"; message: string; canRetry: boolean }
    | { kind: "empty"; query: string }
    | { kind: "success"; courses: Course[]; refreshing: boolean };

const RETRY_MESSAGE = "Could not load courses. Try again.";

function isRetryable(status: number): boolean {
    return status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function deriveUiState(snapshot: RequestSnapshot): CatalogUiState {
    switch (snapshot.status) {
        case "pending":
            return { kind: "loading" };
        case "error": {
            const error = snapshot.error;
            if (!error || isRetryable(error.status)) return { kind: "error", message: RETRY_MESSAGE, canRetry: true };
            if (error.status === 401) return { kind: "error", message: "Your session has expired. Sign in again.", canRetry: false };
            return { kind: "error", message: error.message, canRetry: false };
        }
        case "success": {
            const courses = snapshot.data ?? [];
            if (courses.length === 0) return { kind: "empty", query: snapshot.query.trim() };
            return { kind: "success", courses, refreshing: snapshot.isFetching };
        }
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of snapshots. Output: one UI state per snapshot, courses printed as their ids.
function assertNever(value: never): never {
    throw new Error(`unexpected state: ${JSON.stringify(value)}`);
}

function show(state: CatalogUiState): unknown {
    switch (state.kind) {
        case "loading":
            return { kind: "loading" };
        case "error":
            return { kind: "error", message: state.message, canRetry: state.canRetry };
        case "empty":
            return { kind: "empty", query: state.query };
        case "success":
            return { kind: "success", courses: state.courses.map((c) => c.id), refreshing: state.refreshing };
        default:
            return assertNever(state);
    }
}

const snapshots: RequestSnapshot[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(snapshots.map((s) => show(deriveUiState(s)))));
