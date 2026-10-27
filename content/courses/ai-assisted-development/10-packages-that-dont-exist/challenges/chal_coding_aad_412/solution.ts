import { readFileSync } from "node:fs";

// Reference solution (internal).

type RegistryPackage = {
    weeklyDownloads: number;
    versions: Record<string, string>; // version -> publish date "YYYY-MM-DD"
};

type Policy = {
    popularWeeklyDownloads: number;
    newPackageDays: number;
    minWeeklyDownloads: number;
};

type Suggested = { name: string; range: string };

type Status = "lookalike" | "not_found" | "new_low_downloads" | "version_not_published" | "invalid" | "ok";

type Finding = { name: string; range: string; status: Status; detail: string };

const ORDER: Status[] = ["lookalike", "not_found", "new_low_downloads", "version_not_published", "invalid", "ok"];
const NAME = /^[a-z0-9@/._~-]{1,214}$/;
const RANGE = /^(\*|[~^]?\d+\.\d+\.\d+)$/;

function parse(version: string): number[] {
    return version.split(".").map(Number);
}

function compareVersions(a: string, b: string): number {
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
}

function satisfies(version: string, range: string): boolean {
    if (range === "*") return true;
    const op = range[0] === "^" || range[0] === "~" ? range[0] : "";
    const base = op ? range.slice(1) : range;
    const [v, b] = [parse(version), parse(base)];
    if (op === "") return compareVersions(version, base) === 0;
    if (compareVersions(version, base) < 0) return false;
    if (op === "~" || b[0] === 0) return v[0] === b[0] && v[1] === b[1];
    return v[0] === b[0];
}

function normalize(name: string): string {
    return name.replace(/[@/._~-]/g, "");
}

function levenshtein(a: string, b: string): number {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = row;
    }
    return prev[b.length];
}

function daysBetween(from: string, to: string): number {
    return Math.floor((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

function checkDependencies(
    suggested: Suggested[],
    registry: Record<string, RegistryPackage>,
    policy: Policy,
    today: string,
): Finding[] {
    const popular = Object.keys(registry).filter((n) => registry[n].weeklyDownloads >= policy.popularWeeklyDownloads);

    const check = ({ name, range }: Suggested): Finding => {
        const result = (status: Status, detail = ""): Finding => ({ name, range, status, detail });
        if (!NAME.test(name) || !RANGE.test(range)) return result("invalid");
        const pkg = Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : undefined;

        if (!popular.includes(name)) {
            const n = normalize(name);
            let best: { distance: number; name: string } | null = null;
            for (const p of popular) {
                const np = normalize(p);
                const distance = levenshtein(n, np);
                if (distance > (np.length <= 4 ? 1 : 2)) continue;
                if (!best || distance < best.distance || (distance === best.distance && p < best.name)) best = { distance, name: p };
            }
            if (best) return result("lookalike", best.name);
            if (!pkg) return result("not_found");
            const first = Object.values(pkg.versions).sort()[0];
            const age = daysBetween(first, today);
            if (age < policy.newPackageDays && pkg.weeklyDownloads < policy.minWeeklyDownloads) {
                return result("new_low_downloads", `${age} days, ${pkg.weeklyDownloads}/week`);
            }
        }

        const versions = Object.keys(pkg!.versions).sort(compareVersions);
        const matching = versions.filter((v) => satisfies(v, range));
        if (matching.length === 0) return result("version_not_published", versions[versions.length - 1]);
        return result("ok", matching[matching.length - 1]);
    };

    return suggested
        .map(check)
        .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// ---------------------------------------------------------------- test runner (do not change)
type Input = { today: string; policy: Policy; registry: Record<string, RegistryPackage>; suggested: Suggested[] };

const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkDependencies(input.suggested, input.registry, input.policy, input.today)));
