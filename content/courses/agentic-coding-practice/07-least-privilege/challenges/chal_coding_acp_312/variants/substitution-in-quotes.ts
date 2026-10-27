import { readFileSync } from "node:fs";

// Wrong: $( and backticks are only caught outside quotes.

type Decision = "allow" | "deny" | "ask";
type Rule =
    | "parse-error"
    | "command-substitution"
    | "production"
    | "rm-outside-workspace"
    | "publish"
    | "force-push"
    | "pipe-to-shell"
    | "redirection"
    | "allow-list"
    | "unknown";
type Verdict = { decision: Decision; rule: Rule };
type Policy = { allow: string[]; productionHosts: string[] };

type Token = { kind: "word"; value: string } | { kind: "op"; value: string };
type Segment = { words: string[]; after: string | null };

const OPERATORS = ["&&", "||", "|", ";", "&"];

function lex(command: string): Token[] | Rule {
    const tokens: Token[] = [];
    let word = "";
    let inWord = false;
    const endWord = () => {
        if (inWord) tokens.push({ kind: "word", value: word });
        word = "";
        inWord = false;
    };
    let i = 0;
    while (i < command.length) {
        const ch = command[i];
        if (ch === " " || ch === "\t") {
            endWord();
            i++;
            continue;
        }
        const op = OPERATORS.find((o) => command.startsWith(o, i));
        if (op) {
            endWord();
            tokens.push({ kind: "op", value: op });
            i += op.length;
            continue;
        }
        if (ch === "`" || (ch === "$" && command[i + 1] === "(")) return "command-substitution";
        inWord = true;
        if (ch === "\\") {
            if (i + 1 >= command.length) return "parse-error";
            word += command[i + 1];
            i += 2;
        } else if (ch === "'") {
            const end = command.indexOf("'", i + 1);
            if (end === -1) return "parse-error";
            word += command.slice(i + 1, end);
            i = end + 1;
        } else if (ch === '"') {
            i++;
            for (;;) {
                if (i >= command.length) return "parse-error";
                const c = command[i];
                if (c === '"') break;
                // inside double quotes everything is treated as text
                if (c === "\\") {
                    if (i + 1 >= command.length) return "parse-error";
                    word += command[i + 1];
                    i += 2;
                } else {
                    word += c;
                    i++;
                }
            }
            i++;
        } else {
            word += ch;
            i++;
        }
    }
    endWord();
    return tokens;
}

function split(tokens: Token[]): Segment[] | null {
    const segments: Segment[] = [];
    let current: Segment = { words: [], after: null };
    for (const t of tokens) {
        if (t.kind === "word") {
            current.words.push(t.value);
        } else {
            if (current.words.length === 0) return null;
            segments.push(current);
            current = { words: [], after: t.value };
        }
    }
    if (current.words.length === 0) return null;
    segments.push(current);
    return segments;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function outsideWorkspace(target: string): boolean {
    return target.startsWith("/") || target.startsWith("~") || target.includes("$") || target === ".."
        || target.startsWith("../") || target.endsWith("/..") || target.includes("/../");
}

function judgeSegment(segment: Segment, policy: Policy): Verdict {
    const words = segment.words;
    let k = 0;
    while (k < words.length && ASSIGNMENT.test(words[k])) k++;
    const command = words.slice(k);
    const program = command[0];
    const args = command.slice(1);

    const hosts = policy.productionHosts.map((h) => h.toLowerCase());
    const production = words.some((w) => {
        const lower = w.toLowerCase();
        if (hosts.some((h) => lower.includes(h))) return true;
        if (lower === "--prod" || lower === "--production") return true;
        const eq = lower.indexOf("=");
        if (eq === -1) return false;
        const value = lower.slice(eq + 1);
        return value === "prod" || value === "production";
    });
    if (production) return { decision: "deny", rule: "production" };

    if (program === "rm") {
        let afterDashes = false;
        for (const a of args) {
            if (!afterDashes && a === "--") {
                afterDashes = true;
                continue;
            }
            const isTarget = afterDashes || !a.startsWith("-");
            if (isTarget && outsideWorkspace(a)) return { decision: "deny", rule: "rm-outside-workspace" };
        }
    }
    if ((program === "npm" || program === "pnpm" || program === "yarn") && args.includes("publish")) {
        return { decision: "deny", rule: "publish" };
    }
    if (program === "git" && args.includes("push")
        && args.some((a) => a.startsWith("--force") || a.startsWith("+") || (a.startsWith("-") && !a.startsWith("--") && a.includes("f")))) {
        return { decision: "deny", rule: "force-push" };
    }
    if (["sh", "bash", "zsh", "dash"].includes(program ?? "") && segment.after === "|") {
        return { decision: "deny", rule: "pipe-to-shell" };
    }
    if (words.some((w) => w.includes("<") || w.includes(">"))) return { decision: "ask", rule: "redirection" };
    const allowed = policy.allow.some((entry) => {
        const need = entry.split(" ");
        return command.length >= need.length && need.every((w, j) => command[j] === w);
    });
    if (allowed) return { decision: "allow", rule: "allow-list" };
    return { decision: "ask", rule: "unknown" };
}

function evaluateCommand(command: string, policy: Policy): Verdict {
    const tokens = lex(command);
    if (typeof tokens === "string") return { decision: "deny", rule: tokens };
    const segments = split(tokens);
    if (segments === null) return { decision: "deny", rule: "parse-error" };
    const verdicts = segments.map((s) => judgeSegment(s, policy));
    return verdicts.find((v) => v.decision === "deny")
        ?? verdicts.find((v) => v.decision === "ask")
        ?? { decision: "allow", rule: "allow-list" };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { policy, commands }. Output: one verdict per command, in order.
type Input = { policy: Policy; commands: string[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const results = input.commands.map((command) => {
    const v = evaluateCommand(command, input.policy);
    return { command, decision: v.decision, rule: v.rule };
});
console.log(JSON.stringify(results));
