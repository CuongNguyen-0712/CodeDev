// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-1-2",
    title: "Coupling & cohesion: measuring fan-in and fan-out",
    slug: { _type: "slug", current: "coupling-cohesion-fan-in-fan-out" },
    description:
        "A one-line change to formatDate() in the shared utils module broke receipts, certificates, the leaderboard and six other features in one release. Learn what coupling and cohesion mean in plain terms, how to measure coupling as fan-in, fan-out and instability from the import graph, why a stable module is not a safe module to change, and how to split a grab-bag module by reason to change.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Release 2026.10.21 of the CodeDev API changed one line in src/utils/index.ts: formatDate() now returns ISO dates (2026-10-21) instead of 21/10/2026, because the new invoice PDF needed them. Within two hours support had 9 tickets: receipt emails showed the wrong date format, certificates printed ISO dates, the leaderboard week label read \"Week of 2026-10-19\", course release dates in the catalog were sorted as text, a progress streak counted two days as one, and four more. The pull request had one approving review; the reviewer saw a one-line change in a utility function. Nobody had asked how many modules depended on utils. Your task: make that number visible before the next release.",
    },

    content: [
        h2("1. The incident: a one-line change, nine broken features"),
        p("This is the whole diff that shipped:"),
        code("typescript", `
// src/utils/index.ts
 export function formatDate(d: Date): string {
-    return d.toLocaleDateString("en-GB");          // 21/10/2026
+    return d.toISOString().slice(0, 10);           // 2026-10-21, for the invoice PDF
 }`, "git diff"),
        p("The change is correct for the invoice. It is wrong for everything else that called `formatDate` and expected the old format, and there turned out to be a lot of those. The support queue the next morning:"),
        code("text", `
ORD-431  Receipt email shows "Paid on 2026-10-21"           notifications
CRT-102  Certificate date printed as 2026-10-21              certificates
LDB-077  Leaderboard label "Week of 2026-10-19"              leaderboard
CAT-219  "New courses" sorted wrongly on the catalog page    catalog
PRG-188  Streak counted Monday and Tuesday as one day        progress
ORD-433  Order history dates in the wrong format             orders
PAY-064  Refund confirmation shows ISO date                  payments
LSN-140  "Released on" line in lesson header changed         lessons
QZ-051   Quiz deadline parsed as the wrong day               quizzes`, "support queue"),
        p("Nothing in the diff warned the reviewer. The risk was not in the line that changed; it was in **how many modules depended on that line**. That property has a name - coupling - and you can count it."),

        h2("2. Read the evidence: who imports utils?"),
        p("Before any theory, measure. A module's importers are visible in its import lines. One `grep` lists the files that import `utils`, and cutting the path down to the first folder turns files into modules:"),
        code("bash", `
grep -rlE "from \\"\\.\\./(\\.\\./)?utils\\"" src | cut -d/ -f2 | sort | uniq -c

      4 catalog
      2 leaderboard
      3 lessons
      2 notifications
      5 orders
      1 payments
      6 progress
      2 quizzes
      1 certificates`, "terminal"),
        p("Nine modules import `utils`. The number in front of each is how many **files** in that module import it, which matters less than the fact that the module imports it at all: one importing file is enough for a change in `utils` to reach that module. Now look at what `utils` contains:"),
        code("typescript", `
// src/utils/index.ts - 640 lines
export function formatDate(d: Date): string { ... }
export function formatPrice(amount: number, currency: string): string { ... }
export function slugify(title: string): string { ... }
export function sendEmail(to: string, subject: string, html: string): Promise<void> { ... }
export function calculateLevel(exp: number): number { ... }
export function hashPassword(plain: string): Promise<string> { ... }
export function retryFetch(url: string, tries: number): Promise<Response> { ... }
// ... 23 more`, "src/utils/index.ts"),
        p("Dates, money, URLs, email delivery, the level formula, passwords and HTTP retries. These change for completely different reasons, at different times, for different teams - and every change to any of them is a change to a module that nine others import."),

        h2("3. Coupling and cohesion, in plain words"),
        p("**Coupling** is how much one module depends on others. If module A imports module B, a change in B can break A: A is coupled to B. The more modules depend on each other, the further one change spreads."),
        p("**Cohesion** is how much the things inside one module belong together. A cohesive module has one reason to change: everything in a `money` module changes when the pricing rules change. A module with low cohesion, like `utils`, has many unrelated reasons to change, so it changes often, and each change reaches everyone who imports it for any one of its reasons."),
        p("The goal people repeat - \"low coupling, high cohesion\" - is about one practical question: **when I change this, what else might break?** Good boundaries keep that list short."),
        h3("Three numbers you can compute from imports"),
        p("Draw the import graph between modules: an arrow `orders -> payments` means \"orders imports payments\". Then for each module count:"),
        bullets([
            "**Fan-in** (also called afferent coupling): how many other modules import this one. High fan-in means a change here can reach many places. `utils` has a fan-in of 9.",
            "**Fan-out** (efferent coupling): how many other modules this one imports. High fan-out means this module can be broken by changes in many places, and it is hard to test alone.",
            "**Instability**: `I = fanOut / (fanIn + fanOut)`, a value from 0 to 1, from Robert C. Martin's package metrics. `I = 0` means many depend on it and it depends on nothing; `I = 1` means it depends on others and nobody depends on it.",
        ]),
        p("Count **distinct modules**, not import lines. Five files of `orders` importing `utils` is still one arrow `orders -> utils`: fan-in counts modules that would be affected, and `orders` is affected once. A module importing itself (one file of `orders` importing another) is not coupling between modules at all."),
        callout("warning", "\"Stable\" does not mean \"safe to change\"",
            "Martin calls a module with I near 0 stable, in the sense that it is hard to change: so many modules depend on it that every change is risky. utils has I = 0.00 and it is the most dangerous module in the codebase to edit. A module with I near 1, like orders, is cheap to change because nobody depends on it. The metric tells you where a change is expensive, not where it is harmless."),
        h3("When high numbers are fine, and when not to measure"),
        p("Fan-in is not bad by itself. A small `money` module whose API (`formatPrice(amount, currency)`) has not changed in a year can have a fan-in of 8 and cause no trouble, because it rarely changes. Trouble is **high fan-in combined with frequent changes**, and frequent changes usually come from low cohesion. Likewise, a use-case module such as `orders` is supposed to have a high fan-out: placing an order really does involve catalog, payments, notifications and progress."),
        p("Use the numbers to decide **where to look**, not what to do. A ten-file app with three modules does not need a coupling report; you can see the whole graph. The report earns its place when the codebase is too big for one person to remember who imports what - which is exactly when a one-line change can surprise everyone."),

        h2("4. Worked example: the CodeDev module graph"),
        p("You do not need a special tool to get the graph. `madge` prints the file-level import graph as JSON (`npx madge --json src`), and a few lines turn it into module edges, one line per file import:"),
        code("typescript", `
// scripts/moduleEdges.ts - usage: npx madge --json src | node scripts/moduleEdges.ts
import { readFileSync } from "node:fs";

const graph: Record<string, string[]> = JSON.parse(readFileSync(0, "utf8"));
const moduleOf = (file: string) => file.split("/")[0];      // "orders/placeOrder.ts" -> "orders"

for (const [file, deps] of Object.entries(graph)) {
    for (const dep of deps) console.log(moduleOf(file) + " -> " + moduleOf(dep));
}`, "scripts/moduleEdges.ts"),
        p("The output repeats an edge once for every file that makes it, and contains edges like `orders -> orders` for imports inside a module. A trimmed version of the CodeDev graph, after removing repeats:"),
        code("text", `
orders -> catalog          orders -> payments        orders -> notifications
orders -> progress         orders -> utils           payments -> utils
notifications -> utils     catalog -> utils          progress -> catalog
progress -> utils          leaderboard -> progress   leaderboard -> utils`, "module edges"),
        p("Count by hand for three of the modules:"),
        bullets([
            "**utils:** imported by orders, payments, notifications, catalog, progress and leaderboard: fan-in 6, fan-out 0, instability 0 / 6 = 0.00.",
            "**progress:** imported by orders and leaderboard (fan-in 2); imports catalog and utils (fan-out 2): instability 2 / 4 = 0.50.",
            "**orders:** imported by nobody in this list (fan-in 0); imports five modules (fan-out 5): instability 1.00.",
        ]),
        p("Already on this small graph the picture of the incident is there: one module at the bottom that everything leans on, with 30 unrelated functions in it. The fix is not to make `utils` import less - it imports nothing - but to make **fewer modules depend on each part of it**, by splitting it along its reasons to change:"),
        code("text", `
before                              after
utils (fan-in 9, 30 functions)      text      formatDate, slugify      fan-in 9
                                    money     formatPrice              fan-in 3
                                    email     sendEmail                fan-in 2
                                    levels    calculateLevel           fan-in 2
                                    auth      hashPassword             fan-in 1`, "split by reason to change"),
        p("After the split, a change to the level formula can reach two modules instead of nine, and a reviewer who sees `src/levels/` in a diff knows exactly who to ask. `text` keeps a fan-in of 9: nine modules really do display dates, and no split can change that. What the split changes is **how often** `text` changes: no longer when the price format, email delivery or password hashing changes. For the date itself, the safe move is the one the incident skipped: give the invoice its own `formatIsoDate` instead of changing `formatDate` under everyone's feet, and pin the old behaviour with a test (section 5)."),
        challenge("chal_quiz_saf_121"),

        h2("5. How to verify"),
        bullets([
            "**Compute the report in CI.** Generate the module edges on every pull request, compute fan-in, fan-out and instability, and print the table in the build log. A change to a module with a fan-in above your limit gets a label such as `wide-impact` and a second reviewer.",
            "**Compare before and after a refactor.** Run the report on `main` and on your branch. After splitting `utils`, most new modules should have a much lower fan-in than the old one; if every new module still has a fan-in of 9, every caller still imports everything and you only renamed the grab bag.",
            "**Check co-change in git.** `git log --format= --name-only` grouped by commit shows which modules change together. Modules that always change in the same commits are coupled whatever the import graph says, often through a shared data format.",
            "**Write a test at the boundary.** Before editing a high fan-in function, add a test that pins its current behaviour (`formatDate(new Date(\"2026-10-21\"))` returns `21/10/2026`). The incident's change would have failed it, which would have started the right conversation.",
        ]),
        p("The exercise below is the core of that CI report: given module edges like the ones from `moduleEdges.ts`, with repeats, self-edges and the odd malformed line, compute the three numbers for every module and flag the ones above your limits."),
        challenge("chal_coding_saf_122"),

        h2("6. Common mistakes and how to spot them"),
        bullets([
            "**Counting import lines instead of modules.** Five files of `orders` importing `utils` inflate its fan-in to 5 from a single dependent module. Spot it: fan-in larger than the number of modules in the codebase, or a fan-in that changes when you split a file.",
            "**Reading instability 0 as \"safe\".** The most depended-on module gets the lightest review because its numbers look calm. Spot it: a one-line change to a module with I = 0 and high fan-in approved without anyone listing its importers.",
            "**Renaming the grab bag.** `utils` becomes `common` or `shared` or `helpers`, with the same 30 functions. Spot it: the new module's name says nothing about what it does, and its fan-in is the same as before.",
            "**Splitting into crumbs.** Every function becomes its own module, so every feature imports twelve tiny modules and one feature change edits five of them. Spot it: fan-out of feature modules jumps, and commits keep touching the same group of tiny modules together - they were one cohesive module.",
            "**Treating the numbers as targets.** \"No module may have fan-out above 4\" pushes people to hide dependencies (passing functions around, or importing through a re-export). Spot it: the report improves while the support queue after each release does not.",
        ]),

        h2("7. Summary"),
        bullets([
            "Coupling is how far a change can spread; cohesion is whether a module has one reason to change. Low cohesion makes a module change often, and high fan-in makes each change reach far: together they caused the incident.",
            "Fan-in counts distinct modules that import a module, fan-out counts distinct modules it imports, and instability = fanOut / (fanIn + fanOut). Instability 0 means hard to change safely, not safe to change.",
            "Use the numbers to decide where to look, verify them in CI, and fix a grab-bag module by splitting it along its reasons to change, then compare the report before and after.",
        ]),

        h2("Sources"),
        bullets([
            "Robert C. Martin, the package coupling metrics (afferent and efferent coupling, instability), in Agile Software Development: Principles, Patterns, and Practices",
            "madge documentation: --json and --circular output",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run npx madge --json on the src folder of a project you know, turn it into module edges with the script from section 4, and compute fan-in and fan-out for its five largest modules. Pick the module with the highest fan-in and list its exports next to the modules that use each one, as in the quiz. Would a split along reasons to change lower the fan-in of the part that changes most often?"),
    ],
});
