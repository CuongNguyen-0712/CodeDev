import { readFileSync } from "node:fs";

// CodeDev lesson bookmarks: an in-memory service built from a written spec (see the description).
//
// add(userId, lessonId, at)    checks in this order:
//   1. userId and lessonId must be strings with at least one non-space character, and at a
//      finite number                                  -> "invalid_request"
//   2. lessonId must be one of the catalog's lessons   -> "lesson_not_found"
//   3. the user already bookmarked this lesson         -> "already_bookmarked" (nothing changes)
//   4. the user already has 50 bookmarks               -> "limit_reached"
//   otherwise the bookmark is saved with its time at   -> "added"
// remove(userId, lessonId):
//   invalid userId or lessonId (same rule)             -> "invalid_request"
//   the user had this bookmark                         -> "removed"
//   no such bookmark (also for a lesson not in the catalog) -> "not_bookmarked"
// list(userId): the user's lesson ids, most recent first (largest at first); two bookmarks with
//   the same at: the one added later comes first. A user without bookmarks gets [].
//
// Do not change the types or the test runner.

const MAX_BOOKMARKS_PER_USER = 50;

type AddResult = "added" | "already_bookmarked" | "invalid_request" | "lesson_not_found" | "limit_reached";
type RemoveResult = "removed" | "not_bookmarked" | "invalid_request";

class BookmarkService {
    constructor(lessonIds: string[]) {}

    add(userId: string, lessonId: string, at: number): AddResult {
        return "added";
    }

    remove(userId: string, lessonId: string): RemoveResult {
        return "removed";
    }

    list(userId: string): string[] {
        return [];
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { lessons, commands }. lessons = the catalog's lesson ids. Every command runs in order on
// one service: { op: "add", userId, lessonId, at }, { op: "remove", userId, lessonId } or
// { op: "list", userId }. Output: one JSON array with the result of every command.
type Command =
    | { op: "add"; userId: string; lessonId: string; at: number }
    | { op: "remove"; userId: string; lessonId: string }
    | { op: "list"; userId: string };

const { lessons, commands }: { lessons: string[]; commands: Command[] } = JSON.parse(readFileSync(0, "utf8"));
const service = new BookmarkService(lessons);
const results = commands.map((c) =>
    c.op === "add" ? service.add(c.userId, c.lessonId, c.at)
        : c.op === "remove" ? service.remove(c.userId, c.lessonId)
            : service.list(c.userId)
);
console.log(JSON.stringify(results));
