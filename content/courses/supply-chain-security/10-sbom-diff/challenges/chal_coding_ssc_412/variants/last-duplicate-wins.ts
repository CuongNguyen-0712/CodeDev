import { readFileSync } from "node:fs";

// CodeDev release review: what changed between the SBOM of the last release and the SBOM of this one?
// Both SBOMs are CycloneDX JSON (a subset, described in the challenge text).

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
    if (typeof c.purl === "string" && c.purl !== "") {
        let base = c.purl;
        const hash = base.indexOf("#");
        if (hash >= 0) base = base.slice(0, hash);
        const query = base.indexOf("?");
        if (query >= 0) base = base.slice(0, query);
        let purlVersion = "";
        const at = base.lastIndexOf("@");
        if (at > base.lastIndexOf("/")) {
            purlVersion = base.slice(at + 1);
            base = base.slice(0, at);
        }
        return { key: base.replace(/%40/gi, "@"), fromPurl: true, purlVersion };
    }
    if (typeof c.name === "string" && c.name !== "") {
        return { key: `name:${c.group ? `${c.group}/` : ""}${c.name}`, fromPurl: false, purlVersion: "" };
    }
    return null;
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
    const x = parseSemver(a);
    const y = parseSemver(b);
    if (!x || !y) return null;
    for (const k of ["major", "minor", "patch"] as const) {
        if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
    }
    if (x.pre.length === 0 || y.pre.length === 0) return Math.sign(y.pre.length - x.pre.length);
    for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
        const c = compareIdentifiers(x.pre[i], y.pre[i]);
        if (c !== 0) return c;
    }
    return Math.sign(x.pre.length - y.pre.length);
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
        for (const c of list) {
            const k = componentKey(c);
            if (!k) {
                bad = true;
                return;
            }
            const version = typeof c.version === "string" && c.version !== "" ? c.version : k.purlVersion;
            let versions = entries.get(k.key);
            if (!versions) entries.set(k.key, (versions = new Map()));
            if (versions.has(version)) duplicates++;
            {
                const hashes = new Map<string, string>();
                for (const h of c.hashes ?? []) if (!hashes.has(h.alg)) hashes.set(h.alg, h.content.toLowerCase());
                versions.set(version, { key: k.key, version, fromPurl: k.fromPurl, licenses: licenseList(c), hashes });
            }
            if (Array.isArray(c.components)) walk(c.components);
            if (bad) return;
        }
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
        for (const [version, be] of [...bv].sort((x, y) => byString(x[0], y[0]))) {
            const ae = av.get(version);
            if (!ae) continue;
            if (!sameList(be.licenses, ae.licenses)) res.licenseChanged.push({ key, version, from: be.licenses, to: ae.licenses });
            const algs = [...be.hashes.keys()].filter((alg) => ae.hashes.has(alg) && ae.hashes.get(alg) !== be.hashes.get(alg));
            if (algs.length) res.hashChanged.push({ key, version, algs: algs.sort(byString) });
        }
        const bOnly = [...bv.keys()].filter((v) => !av.has(v)).sort(byString);
        const aOnly = [...av.keys()].filter((v) => !bv.has(v)).sort(byString);
        if (bOnly.length === 1 && aOnly.length === 1) {
            const from = bOnly[0];
            const to = aOnly[0];
            const cmp = compareSemver(from, to);
            const direction: Direction = cmp === null ? "unknown" : cmp < 0 ? "upgrade" : cmp > 0 ? "downgrade" : "same";
            const sameMajor = cmp !== null && parseSemver(from)!.major === parseSemver(to)!.major;
            res.versionChanged.push({ key, from, to, direction, sameMajor });
            const bl = bv.get(from)!.licenses;
            const al = av.get(to)!.licenses;
            if (!sameList(bl, al)) res.licenseChanged.push({ key, version: to, from: bl, to: al });
        } else {
            for (const v of bOnly) res.removed.push({ key, version: v });
            for (const v of aOnly) res.added.push({ key, version: v });
        }
    }
    const order = (x: { key: string; version: string }, y: { key: string; version: string }) =>
        byString(x.key, y.key) || byString(x.version, y.version);
    res.licenseChanged.sort(order);
    res.hashChanged.sort(order);
    return {
        ...res,
        summary: {
            before: countBefore,
            after: countAfter,
            added: res.added.length,
            removed: res.removed.length,
            versionChanged: res.versionChanged.length,
            licenseChanged: res.licenseChanged.length,
            hashChanged: res.hashChanged.length,
            duplicatesCollapsed: b.duplicates + a.duplicates,
            withoutPurl: fallback.size,
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
const input = JSON.parse(readFileSync(0, "utf8")) as { before: unknown; after: unknown };
console.log(JSON.stringify(diffSboms(input.before, input.after)));
