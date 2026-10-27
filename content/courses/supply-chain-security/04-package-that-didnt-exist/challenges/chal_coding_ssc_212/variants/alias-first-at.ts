import { readFileSync } from "node:fs";

// The Package That Didn't Exist. An AI assistant added "@codedev-ui/form-utils" to CodeDev's
// package.json. CodeDev owns the npm scope @codedev, not @codedev-ui. The CI step check-deps
// printed "1 skipped (owned scope)" and passed. Three days later someone registered @codedev-ui
// and published a version whose postinstall script read the environment variables of the build.
//
// checkDependencies(dependencies, policy, registry) returns one finding per entry of
// "dependencies", in input order: { dependency, package, status }.
//
//   dependency  the key in package.json
//   package     the package npm will install: the key itself, or for an alias
//               ("key": "npm:<name>@<range>", "npm:<name>" without a range is allowed too)
//               the <name> after "npm:". A scoped name starts with "@", so the "@" before the
//               range is the first "@" after the first character. "" when status is "invalid".
//   status, the first rule that applies:
//     "invalid"        the key or the package is not a valid name. Valid: "<part>" or
//                      "@<part>/<part>", where <part> starts with a-z or 0-9 and continues with
//                      a-z 0-9 . _ -  and the whole name has at most 214 characters.
//                      "npm:" followed by something that is not a valid name is invalid too.
//     "unknown_scope"  the package is scoped and its scope ("@codedev" in "@codedev/ui-kit") is
//                      neither one of policy.ownedScopes nor one of policy.knownScopes, compared
//                      as whole strings.
//     "not_found"      the package is not in the registry snapshot (scoped packages too,
//                      including those of an owned scope).
//     "ok"
//
// The range part of a spec is not checked here (another step validates ranges).
// Do not change the types or the test runner.

type Policy = {
    ownedScopes: string[]; // scopes CodeDev owns on the registry, e.g. ["@codedev"]
    knownScopes: string[]; // reviewed third-party scopes, e.g. ["@types", "@tanstack"]
};

type Status = "invalid" | "unknown_scope" | "not_found" | "ok";

type Finding = { dependency: string; package: string; status: Status };

const PART = "[a-z0-9][a-z0-9._-]*";
const NAME = new RegExp(`^(?:@${PART}/)?${PART}$`);

function isValidName(name: string): boolean {
    return name.length <= 214 && NAME.test(name);
}

// The package npm installs for one entry: the key, or the target of an "npm:" alias.
function installedPackage(key: string, spec: string): string {
    if (!spec.startsWith("npm:")) return key;
    const rest = spec.slice(4);
    const at = rest.indexOf("@");
    return at === -1 ? rest : rest.slice(0, at);
}

function checkDependencies(dependencies: Record<string, string>, policy: Policy, registry: string[]): Finding[] {
    const published = new Set(registry);
    const trustedScopes = new Set([...policy.ownedScopes, ...policy.knownScopes]);
    const findings: Finding[] = [];
    for (const [key, spec] of Object.entries(dependencies)) {
        const pkg = installedPackage(key, spec);
        if (!isValidName(key) || !isValidName(pkg)) {
            findings.push({ dependency: key, package: "", status: "invalid" });
            continue;
        }
        let status: Status = "ok";
        if (pkg.startsWith("@") && !trustedScopes.has(pkg.slice(0, pkg.indexOf("/")))) status = "unknown_scope";
        else if (!published.has(pkg)) status = "not_found";
        findings.push({ dependency: key, package: pkg, status });
    }
    return findings;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { ownedScopes, knownScopes, registry, dependencies }. Output: the findings as JSON.
type Input = { ownedScopes: string[]; knownScopes: string[]; registry: string[]; dependencies: Record<string, string> };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const policy: Policy = { ownedScopes: input.ownedScopes, knownScopes: input.knownScopes };
console.log(JSON.stringify(checkDependencies(input.dependencies, policy, input.registry)));
