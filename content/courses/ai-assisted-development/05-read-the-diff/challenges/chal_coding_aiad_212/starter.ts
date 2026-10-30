import { readFileSync } from "node:fs";

// The coding agent says "Done, all tests pass". Before reading a single hunk, the reviewer wants the
// shape of the change: which files it touches, how, and how many lines.
//
// summariseDiff(diff) gets the text of `git diff` (or `git show`) and returns one entry per file, in
// the order the files appear, plus totals.
//
//   - A file section starts at a line "diff --git a/<old path> b/<new path>" (paths contain no spaces).
//     Lines before the first such line (for example the commit message of `git show`) are ignored.
//   - path: the <new path>; for a deleted file, the <old path>.
//   - status, from the header lines of the section (the lines before its first "@@" hunk header):
//       "added"    a "new file mode ..." line or a "--- /dev/null" line
//       "deleted"  a "deleted file mode ..." line or a "+++ /dev/null" line
//       "renamed"  a "rename from ..." line (a renamed file can also have hunks)
//       "modified" anything else (content change, mode change, binary change)
//   - added / removed: count only lines INSIDE hunks (after a line starting with "@@" in this section):
//       a line starting with "+" is added, a line starting with "-" is removed, " " is context,
//       "\ No newline at end of file" is a marker and counts as nothing. Inside a hunk, a line such as
//       "--- old SQL comment" or "+++counter" is content, not a file header.
//   - totals: { files, added, removed } over all files. An empty diff gives no files and zero totals.

type FileStatus = "added" | "deleted" | "modified" | "renamed";

interface FileSummary {
    path: string;
    status: FileStatus;
    added: number;
    removed: number;
}

interface DiffSummary {
    files: FileSummary[];
    totals: { files: number; added: number; removed: number };
}

function summariseDiff(diff: string): DiffSummary {
    // TODO: walk the lines of the diff and build the summary
    return { files: [], totals: { files: 0, added: 0, removed: 0 } };
}

// ---------------------------------------------------------------- test runner (do not change)
console.log(JSON.stringify(summariseDiff(readFileSync(0, "utf8"))));
