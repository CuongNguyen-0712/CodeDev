import { readFileSync } from "node:fs";

// CodeDev release review: what changed between the SBOM of the last release and the SBOM of this one?
// Both SBOMs are CycloneDX JSON (a subset, described in the challenge text).
//
// 1. Walk every component, nested ones included (components inside components, any depth),
//    in document order: a parent before its children, its children before the next sibling.
// 2. Key each component by its purl without version, qualifiers (?...) and subpath (#...), with %40
//    decoded to @ ("pkg:npm/%40codedev/ui@2.1.0?x=1" -> "pkg:npm/@codedev/ui"). No purl: the key is
//    "name:<group>/<name>", or "name:<name>" without a group. The version is the "version" field, or
//    the version written in the purl when the field is missing or empty.
// 3. Within one SBOM, the same key + version listed again is a duplicate: keep the first one.
// 4. Compare the two SBOMs key by key (see the challenge text for added, removed, versionChanged,
//    licenseChanged and hashChanged), sort every list and add the summary.
// Do not change the types or the test runner.

type License = { license?: { id?: string; name?: string }; expression?: string };
type Hash = { alg: string; content: string };
type Component = {
    type?: string;
    name?: string;
    group?: string;
    version?: string;
    purl?: string;
    licenses?: License[];
    hashes?: Hash[];
    components?: Component[];
};
type Bom = { bomFormat?: string; specVersion?: string; components?: Component[] };

type Direction = "upgrade" | "downgrade" | "same" | "unknown";
type DiffResult =
    | {
          added: { key: string; version: string }[];
          removed: { key: string; version: string }[];
          versionChanged: { key: string; from: string; to: string; direction: Direction; sameMajor: boolean }[];
          licenseChanged: { key: string; version: string; from: string[]; to: string[] }[];
          hashChanged: { key: string; version: string; algs: string[] }[];
          summary: {
              before: number;
              after: number;
              added: number;
              removed: number;
              versionChanged: number;
              licenseChanged: number;
              hashChanged: number;
              duplicatesCollapsed: number;
              withoutPurl: number;
          };
      }
    | { error: string };

/** The comparison key of a component, or null when it has neither a purl nor a name. */
function componentKey(c: Component): string | null {
    return null;
}

/** SemVer 2.0.0 precedence of a and b: -1, 0 or 1; null when either one is not a valid semver version. */
function compareSemver(a: string, b: string): number | null {
    return null;
}

function diffSboms(before: unknown, after: unknown): DiffResult {
    return {
        added: [],
        removed: [],
        versionChanged: [],
        licenseChanged: [],
        hashChanged: [],
        summary: {
            before: 0,
            after: 0,
            added: 0,
            removed: 0,
            versionChanged: 0,
            licenseChanged: 0,
            hashChanged: 0,
            duplicatesCollapsed: 0,
            withoutPurl: 0,
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
const input = JSON.parse(readFileSync(0, "utf8")) as { before: unknown; after: unknown };
console.log(JSON.stringify(diffSboms(input.before, input.after)));
