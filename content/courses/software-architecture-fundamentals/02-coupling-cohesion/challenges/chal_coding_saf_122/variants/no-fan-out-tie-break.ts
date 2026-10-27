import { readFileSync } from "node:fs";

// CodeDev backend: a one-line change to the shared "utils" module broke 9 features in one release.
// Nobody knew how many modules depended on utils. Turn the module dependency graph into numbers.
//
// analyzeCoupling(edges, limits):
//   1. Each edge is a string "a -> b": module a imports module b. Spaces around the arrow are optional.
//      A line is valid when it contains exactly one "->" and each side, after trimming, is one non-empty
//      module name without whitespace. Count invalid lines in "skipped" and ignore them otherwise.
//   2. The same edge listed twice counts once. A self-edge ("a -> a") adds no dependency, but every
//      module named in a valid line appears in the report.
//   3. fanIn = how many other modules import this one; fanOut = how many other modules this one imports.
//      instability = Math.round(fanOut * 100 / (fanIn + fanOut)) / 100, and 0 when fanIn + fanOut is 0.
//   4. flags, in this order: "high-fan-in" when fanIn > limits.maxFanIn,
//      "high-fan-out" when fanOut > limits.maxFanOut; an empty array when neither applies.
//   5. Sort the modules by fanIn (highest first), then fanOut (highest first), then name A to Z
//      (compared with < and >).
// Return { modules, skipped }.
//
// Do not change the types or the test runner.

type ModuleReport = {
    module: string;
    fanIn: number;
    fanOut: number;
    instability: number;
    flags: string[];
};

type Limits = { maxFanIn: number; maxFanOut: number };

type CouplingReport = { modules: ModuleReport[]; skipped: number };

function analyzeCoupling(edges: string[], limits: Limits): CouplingReport {
    const importers = new Map<string, Set<string>>(); // module -> modules that import it
    const imported = new Map<string, Set<string>>(); // module -> modules it imports
    const touch = (name: string) => {
        if (!importers.has(name)) importers.set(name, new Set());
        if (!imported.has(name)) imported.set(name, new Set());
    };
    let skipped = 0;

    for (const line of edges) {
        const parts = line.split("->").map((s) => s.trim());
        if (parts.length !== 2 || parts.some((s) => s === "" || /\s/.test(s))) {
            skipped++;
            continue;
        }
        const [from, to] = parts;
        touch(from);
        touch(to);
        if (from === to) continue;
        imported.get(from)!.add(to);
        importers.get(to)!.add(from);
    }

    const modules: ModuleReport[] = [...importers.keys()].map((module) => {
        const fanIn = importers.get(module)!.size;
        const fanOut = imported.get(module)!.size;
        const total = fanIn + fanOut;
        const flags: string[] = [];
        if (fanIn > limits.maxFanIn) flags.push("high-fan-in");
        if (fanOut > limits.maxFanOut) flags.push("high-fan-out");
        return { module, fanIn, fanOut, instability: total === 0 ? 0 : Math.round((fanOut * 100) / total) / 100, flags };
    });

    modules.sort((a, b) => b.fanIn - a.fanIn || (a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
    return { modules, skipped };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { edges: string[], limits: { maxFanIn, maxFanOut } }. Output: the report as JSON.
type Input = { edges: string[]; limits: Limits };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(analyzeCoupling(input.edges, input.limits)));
