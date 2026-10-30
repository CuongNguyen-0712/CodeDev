import { readFileSync } from "node:fs";

// CodeDev coupling report: one line per module, in the order of input.modules.
//
// input.modules       the module names (unique), for example ["catalog", "orders", "payments"]
// input.dependencies  pairs [from, to]: module "from" imports something from module "to"
// input.threshold     a module is flagged HIGH when fanIn + fanOut is greater than this number
//
// Rules:
//   - a dependency listed more than once counts once
//   - a self-dependency (from and to are the same module) is ignored
//   - fanIn(X)  = how many different modules depend on X
//   - fanOut(X) = how many different modules X depends on
//   - instability I = fanOut / (fanIn + fanOut), rounded to 2 decimals with Math.round(I * 100) / 100
//     and printed with toFixed(2); a module with no dependencies at all has I = 0
//   - line format: "<name> in=<fanIn> out=<fanOut> I=<I>", plus " HIGH" when fanIn + fanOut > threshold
//   - if a dependency names a module that is not in input.modules, return exactly one line
//     "error: unknown module <name>" for the first unknown name (dependencies in input order,
//     "from" checked before "to") and nothing else
//
// Do not change the Input interface or the test runner.

interface Input {
    modules: string[];
    dependencies: [string, string][];
    threshold: number;
}

function couplingReport(input: Input): string[] {
    const lines: string[] = [];
    for (const name of input.modules) {
        // TODO: check for unknown modules, skip duplicates and self-dependencies,
        // count fanIn and fanOut, compute I and add " HIGH" when needed.
        const fanIn = 0;
        const fanOut = 0;
        lines.push(`${name} in=${fanIn} out=${fanOut} I=0.00`);
    }
    return lines;
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
for (const line of couplingReport(input)) console.log(line);
