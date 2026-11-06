import { readFileSync } from "node:fs";

// CodeDev agent harness: before the coding agent runs a shell command, the harness calls
// evaluateCommand(command, policy) and gets a verdict: "allow" (run it), "deny" (refuse it) or "ask"
// (a person decides). The rule that decided goes to that person and to the audit log.
//
// 1. Lexing - a simplified shell lexer, left to right:
//    - Outside quotes, a space or a tab ends the current word.
//    - Outside quotes, "&&", "||", "|", ";" and "&" are operators; they also end the current word.
//      Read two-character operators first ("&&" before "&", "||" before "|").
//    - '...'  everything up to the next ' is literal (no escapes inside).
//    - "..."  everything up to the next " is literal, except that \ makes the next character literal.
//    - Outside quotes, \ makes the next character literal.
//    - Quoted parts and plain characters that touch form one word: np"m" te'st' is the words npm and test.
//      '' or "" on its own is an empty word.
//    - An unescaped "$(" or backtick, outside single quotes, stops lexing: deny, rule "command-substitution".
//    - An unterminated quote, or a \ as the last character: deny, rule "parse-error".
// 2. Segments: the operators split the words into segments (simple commands). A segment without words
//    (empty command, an operator at the start or end, two operators in a row): deny, rule "parse-error".
// 3. In a segment, leading words that match /^[A-Za-z_][A-Za-z0-9_]*=/ are environment assignments
//    (DATABASE_URL=..., CI=1). The next word is the program, the words after it are its arguments.
//    A segment may have assignments and no program.
// 4. Each segment gets the verdict of the FIRST rule that matches, in this order:
//    deny  "production"            a word of the segment (assignments included), lowercased, contains one of
//                                  policy.productionHosts lowercased; or a word, lowercased, is "--prod" or
//                                  "--production"; or a word contains "=" and the part after its first "=",
//                                  lowercased, is "prod" or "production".
//    deny  "rm-outside-workspace"  program "rm" and a target outside the workspace. Targets: the arguments that do
//                                  not start with "-", plus every argument after the first "--" argument. Outside:
//                                  starts with "/" or "~", contains "$", is "..", starts with "../", ends with
//                                  "/.." or contains "/../".
//    deny  "publish"               program "npm", "pnpm" or "yarn" and an argument equal to "publish".
//    deny  "force-push"            program "git", an argument equal to "push", and an argument that starts with
//                                  "--force", or starts with "+", or starts with one "-" (not "--") and contains "f".
//    deny  "pipe-to-shell"         program "sh", "bash", "zsh" or "dash" and the operator just before the segment is "|".
//    ask   "redirection"           a word contains "<" or ">".
//    allow "allow-list"            the program and its arguments begin with all the words of a policy.allow entry
//                                  (the entry split on " "), compared exactly: "npm run test -- --coverage" begins
//                                  with "npm run test"; "npm run testing" does not.
//    ask   "unknown"               anything else.
// 5. The command: "deny" if a segment is denied, otherwise "ask" if a segment asks, otherwise "allow".
//    The rule is the one of the first segment, left to right, that has that decision.
//
// Do not change the types or the test runner.

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

function evaluateCommand(command: string, policy: Policy): Verdict {
    // @piece parse: Deny what cannot be parsed safely
    const tokens = lex(command);
    if (typeof tokens === "string") return { decision: "deny", rule: tokens };
    const segments = split(tokens);
    if (segments === null) return { decision: "deny", rule: "parse-error" };
    // @end
    // @piece combine: One verdict for the whole line
    const verdicts = segments.map((s) => judgeSegment(s, policy));
    return verdicts.find((v) => v.decision === "deny")
        ?? verdicts.find((v) => v.decision === "ask")
        ?? { decision: "allow", rule: "allow-list" };
    // @end
}

// @piece token-types: Tokens, segments and the shell operators
type Token = { kind: "word"; value: string } | { kind: "op"; value: string };
type Segment = { words: string[]; after: string | null };

const OPERATORS = ["&&", "||", "|", ";", "&"];
// @end

// @piece lex: Helper: split a command line into words and operators
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
                if (c === "`" || (c === "$" && command[i + 1] === "(")) return "command-substitution";
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
// @end

// @piece split: Helper: group tokens into one segment per program
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
// @end

// @piece outside-workspace: Helper: env assignments and paths outside the workspace
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function outsideWorkspace(target: string): boolean {
    return target.startsWith("/") || target.startsWith("~") || target.includes("$") || target === ".."
        || target.startsWith("../") || target.endsWith("/..") || target.includes("/../");
}
// @end

// @piece judge-segment: Helper: the verdict for one program
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
// @end

// ---------------------------------------------------------------- test runner (do not change)
// Input: { policy, commands }. Output: one verdict per command, in order.
type Input = { policy: Policy; commands: string[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const results = input.commands.map((command) => {
    const v = evaluateCommand(command, input.policy);
    return { command, decision: v.decision, rule: v.rule };
});
console.log(JSON.stringify(results));
