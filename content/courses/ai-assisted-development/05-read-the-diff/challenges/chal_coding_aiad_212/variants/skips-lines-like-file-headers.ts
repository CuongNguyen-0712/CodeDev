import { readFileSync } from "node:fs";

// Wrong answer: no hunk tracking; every line starting with --- or +++ is treated as a file header.

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
    const files: FileSummary[] = [];
    let current: FileSummary | null = null;
    let oldPath = "";
    let inHunk = false;

    for (const line of diff.split("\n")) {
        if (line.startsWith("diff --git ")) {
            const parts = line.split(" ");
            oldPath = (parts[2] ?? "").replace(/^a\//, "");
            current = { path: (parts[3] ?? "").replace(/^b\//, ""), status: "modified", added: 0, removed: 0 };
            files.push(current);
            inHunk = false;
            continue;
        }
        if (current === null) continue; // preamble, e.g. the commit message of `git show`
        if (line.startsWith("@@")) {
            inHunk = true;
            continue;
        }
        if (line.startsWith("+") && !line.startsWith("+++")) { current.added++; continue; }
        if (line.startsWith("-") && !line.startsWith("---")) { current.removed++; continue; }
        if (line.startsWith("new file mode") || line === "--- /dev/null") {
            current.status = "added";
        } else if (line.startsWith("deleted file mode") || line === "+++ /dev/null") {
            current.status = "deleted";
            current.path = oldPath;
        } else if (line.startsWith("rename from ")) {
            current.status = "renamed";
        }
    }

    const totals = { files: files.length, added: 0, removed: 0 };
    for (const file of files) {
        totals.added += file.added;
        totals.removed += file.removed;
    }
    return { files, totals };
}

// ---------------------------------------------------------------- test runner (do not change)
console.log(JSON.stringify(summariseDiff(readFileSync(0, "utf8"))));
