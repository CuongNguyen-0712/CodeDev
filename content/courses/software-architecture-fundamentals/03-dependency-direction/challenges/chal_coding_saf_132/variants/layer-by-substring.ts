import { readFileSync } from "node:fs";

// CodeDev backend: the orders module is split into layers, and a review checklist says which way
// imports may point. Reviewers keep missing the wrong ones. Write the check that CI will run.
//
// 1. The layer of a path: split the path on "/", drop the last part (the file name), and take the
//    FIRST remaining folder that is one of these names:
//      "controllers" -> "controller"   "services" -> "service"
//      "domain"      -> "domain"       "repositories" -> "repository"
//    Names are compared exactly (case-sensitive). A path with none of these folders has no layer
//    (null): shared code, a package such as "zod" or "node:crypto", a test file. It is never checked.
//
// 2. Which imports are allowed (row = layer of the importing file, column = layer of the import):
//
//                  controller            service            domain   repository
//    controller    ok                    ok                 ok       controller-skips-service
//    service       points-backward       ok                 ok       service-needs-port
//    domain        domain-must-be-pure   domain-must-be-pure ok      domain-must-be-pure
//    repository    points-backward       points-backward    ok       ok
//
//    A service reaches the database only through a port: an interface in the domain layer
//    (for example src/orders/domain/ports/orderRepository.ts) that a repository implements.
//
// findViolations(files) returns one violation per forbidden import, with the rule from the table:
//   { file, import, from, to, rule }  (from / to are the two layers).
// The same import listed twice in one file is reported once. Sort by file, then by import,
// both A to Z compared with < and >. No violations: an empty array.
//
// Do not change the types or the test runner.

type Layer = "controller" | "service" | "domain" | "repository";

type SourceFile = { path: string; imports: string[] };

type Violation = { file: string; import: string; from: Layer; to: Layer; rule: string };

const FOLDERS: Record<string, Layer> = {
    controllers: "controller",
    services: "service",
    domain: "domain",
    repositories: "repository",
};

// null = allowed
const RULES: Record<Layer, Record<Layer, string | null>> = {
    controller: { controller: null, service: null, domain: null, repository: "controller-skips-service" },
    service: { controller: "points-backward", service: null, domain: null, repository: "service-needs-port" },
    domain: { controller: "domain-must-be-pure", service: "domain-must-be-pure", domain: null, repository: "domain-must-be-pure" },
    repository: { controller: "points-backward", service: "points-backward", domain: null, repository: null },
};

function layerOf(path: string): Layer | null {
    if (path.includes("controller")) return "controller";
    if (path.includes("service")) return "service";
    if (path.includes("domain")) return "domain";
    if (path.includes("repositor")) return "repository";
    return null;
}

function findViolations(files: SourceFile[]): Violation[] {
    const violations: Violation[] = [];
    for (const file of files) {
        const from = layerOf(file.path);
        if (from === null) continue;
        for (const imp of new Set(file.imports)) {
            const to = layerOf(imp);
            if (to === null) continue;
            const rule = RULES[from][to];
            if (rule !== null) violations.push({ file: file.path, import: imp, from, to, rule });
        }
    }
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return violations.sort((a, b) => cmp(a.file, b.file) || cmp(a.import, b.import));
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { files: [{ path, imports }] } with imports already resolved to paths from the repository root.
// Output: the violations as JSON.
type Input = { files: SourceFile[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(findViolations(input.files)));
