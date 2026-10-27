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
    return { decision: "ask", rule: "unknown" };
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
