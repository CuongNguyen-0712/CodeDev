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

type Entry = { key: string; version: string; fromPurl: boolean; licenses: string[]; hashes: Map<string, string> };
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

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * key: the purl without version, qualifiers and subpath, with %40 decoded to @; or "name:<group>/<name>"
 * ("name:<name>" without a group) when there is no purl. purlVersion: the version written in the purl.
 */
function componentKey(c: Component): { key: string; fromPurl: boolean; purlVersion: string } | null {
    // [ ] Key and purl version of one component
}

type SemVer = { major: number; minor: number; patch: number; pre: string[] };
const SEMVER =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseSemver(v: string): SemVer | null {
    const m = SEMVER.exec(v);
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split(".") : [] };
}

function compareIdentifiers(a: string, b: string): number {
    const an = /^\d+$/.test(a);
    const bn = /^\d+$/.test(b);
    if (an && bn) return Math.sign(Number(a) - Number(b));
    if (an) return -1;
    if (bn) return 1;
    return byString(a, b);
}

/** SemVer 2.0.0 precedence: -1, 0 or 1; null when either version is not semver. */
function compareSemver(a: string, b: string): number | null {
    // [ ] SemVer precedence of two versions
}

function licenseList(c: Component): string[] {
    const out = new Set<string>();
    for (const l of c.licenses ?? []) {
        const v = l.license?.id ?? l.license?.name ?? l.expression;
        if (typeof v === "string" && v !== "") out.add(v);
    }
    return [...out].sort(byString);
}

/** key -> version -> entry; the first occurrence (pre-order) of a key+version wins. */
function collect(bom: Bom): { entries: Map<string, Map<string, Entry>>; duplicates: number } | null {
    const entries = new Map<string, Map<string, Entry>>();
    let duplicates = 0;
    let bad = false;
    const walk = (list: Component[]) => {
        // [ ] Walk every component, keep the first key + version
    };
    walk(bom.components ?? []);
    return bad ? null : { entries, duplicates };
}

const isBom = (b: unknown): b is Bom =>
    typeof b === "object" && b !== null && (b as Bom).bomFormat === "CycloneDX"
    && ((b as Bom).components === undefined || Array.isArray((b as Bom).components));

function diffSboms(before: unknown, after: unknown): DiffResult {
    if (!isBom(before)) return { error: "before is not a CycloneDX SBOM" };
    if (!isBom(after)) return { error: "after is not a CycloneDX SBOM" };
    const b = collect(before);
    if (!b) return { error: "before has a component without purl or name" };
    const a = collect(after);
    if (!a) return { error: "after has a component without purl or name" };

    const res = {
        added: [] as { key: string; version: string }[],
        removed: [] as { key: string; version: string }[],
        versionChanged: [] as { key: string; from: string; to: string; direction: Direction; sameMajor: boolean }[],
        licenseChanged: [] as { key: string; version: string; from: string[]; to: string[] }[],
        hashChanged: [] as { key: string; version: string; algs: string[] }[],
    };
    const sameList = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
    const fallback = new Set<string>();
    let countBefore = 0;
    let countAfter = 0;
    for (const [, m] of b.entries) for (const e of m.values()) { countBefore++; if (!e.fromPurl) fallback.add(e.key); }
    for (const [, m] of a.entries) for (const e of m.values()) { countAfter++; if (!e.fromPurl) fallback.add(e.key); }

    const keys = [...new Set([...b.entries.keys(), ...a.entries.keys()])].sort(byString);
    for (const key of keys) {
        const bv = b.entries.get(key) ?? new Map<string, Entry>();
        const av = a.entries.get(key) ?? new Map<string, Entry>();
        // [ ] License and hash changes of the same version
        // [ ] Version changes, additions and removals
    }
    // [ ] Sort the lists and add the summary
}

// ---------------------------------------------------------------- test runner (do not change)
const input = JSON.parse(readFileSync(0, "utf8")) as { before: unknown; after: unknown };
console.log(JSON.stringify(diffSboms(input.before, input.after)));
