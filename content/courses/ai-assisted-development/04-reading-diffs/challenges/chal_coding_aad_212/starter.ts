import { readFileSync } from "node:fs";

// CodeDev code review: a coding agent's pull request was approved as "a 20-line fix" while the same
// diff deleted a database migration further down. Before anyone reads the hunks, the review bot now
// prints a summary of every file the diff touches. Write the parser behind that summary.
//
// parseDiff(diff) reads the output of `git diff` (unified format, Git's default options) and returns
// one FileChange per file, in the order the files appear.
//
// The format, file by file:
//   diff --git a/<old path> b/<new path>      starts a file (paths never contain spaces)
//   header lines, any of:
//     new file mode 100644                    -> status "added"
//     deleted file mode 100644                -> status "deleted"
//     similarity index 91%                    \
//     rename from <old path>                   > the old and new paths differ -> status "renamed"
//     rename to <new path>                    /
//     old mode 100644 / new mode 100755       (a mode change: still "modified")
//     index e452725..e8accca 100644
//     --- a/<path>   or   --- /dev/null
//     +++ b/<path>   or   +++ /dev/null
//     Binary files a/<path> and b/<path> differ   -> binary: true (no hunks follow)
//   hunks: a line starting with "@@" (@@ -12,7 +12,9 @@ ...) and then the hunk lines:
//     " ..." context, "+..." an added line, "-..." a removed line,
//     "\ No newline at end of file" (a marker, not a line of the file)
//   Everything else is "modified".
//
// FileChange:
//   path     the path after the change; for a deleted file, the path it had
//   from     the old path when the status is "renamed", otherwise null
//   status   "added" | "deleted" | "modified" | "renamed"
//   binary   true when Git printed "Binary files ... differ" for the file
//   added    number of added lines in the file's hunks (0 for a binary file)
//   removed  number of removed lines in the file's hunks (0 for a binary file)
//
// Careful: a hunk line is classified by its first character only. The content of a changed line can
// itself start with "--", "++" or even "diff --git" (an SQL comment, a .patch file in the repository).
// Text before the first "diff --git" line (notes, a commit header) belongs to no file: ignore it.
// An input with no "diff --git" line at all has no files.
//
// Do not change the types or the test runner.

type FileStatus = "added" | "deleted" | "modified" | "renamed";

type FileChange = {
    path: string;
    from: string | null;
    status: FileStatus;
    binary: boolean;
    added: number;
    removed: number;
};

function parseDiff(diff: string): FileChange[] {
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: the raw text of one `git diff` on stdin. Output: the files and the totals the review bot shows.
const files = parseDiff(readFileSync(0, "utf8")).map((f) => ({
    path: f.path,
    from: f.from,
    status: f.status,
    binary: f.binary,
    added: f.added,
    removed: f.removed,
}));
const totals = {
    files: files.length,
    added: files.reduce((sum, f) => sum + f.added, 0),
    removed: files.reduce((sum, f) => sum + f.removed, 0),
};
console.log(JSON.stringify({ files, totals }));
