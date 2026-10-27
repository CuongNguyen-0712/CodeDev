import { readFileSync } from "node:fs";

// Dependency gate for CodeDev pull requests: every package a pull request adds or updates is allowed
// or blocked before `npm ci` runs, with the reasons. Decide each change on its own (name + new version).
//
// Blocking reasons, in this order:
//   "not in registry"          the snapshot has no such package, or not that version
//   "publish date unknown"     the version's timestamp is not ISO 8601 ("2026-10-20T08:15:00Z" or with an
//                              offset such as "+07:00"); without a date there is no quarantine check
//   "not on allowlist"         no allowlist entry matches: an entry matches its exact name, and an entry
//                              "@scope/*" matches every package of that scope ("@scope/" + anything)
//   "quarantined until <D> (published <P>)"
//                              P = the UTC calendar date of the publish instant, D = P + quarantineDays days;
//                              blocked while today < D (today is a "YYYY-MM-DD" UTC date)
// Exceptions: { name, version, ticket, expires }. One matches a change with the same name and exact version;
// it is valid while expires is a real "YYYY-MM-DD" date and today <= expires.
//   - a valid exception lifts "not on allowlist" and quarantine, never the registry reasons;
//     when it turns a block into an allow, the only reason is "exception <ticket> (expires <expires>)"
//     (the first valid matching exception in the list)
//   - when the change is still blocked and matching exceptions exist but none is valid, add
//     "exception <ticket> not valid (expires <expires>)" for the first matching one as the last reason
// A change with no blocking reason is allowed with no reasons.

type Change = { name: string; from: string | null; to: string };
type Exception = { name: string; version: string; ticket: string; expires: string };
type Policy = { allowlist: string[]; quarantineDays: number; exceptions: Exception[] };
type Registry = Record<string, Record<string, string>>; // name -> version -> publish timestamp
type Decision = { allow: boolean; reasons: string[] };

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function isDate(text: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const ms = Date.parse(`${text}T00:00:00Z`);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === text; // rejects 2026-02-30
}

function onAllowlist(name: string, allowlist: string[]): boolean {
    return allowlist.some((entry) =>
        entry.startsWith("@") && entry.endsWith("/*") ? name.startsWith(entry.slice(0, -1)) : name === entry);
}

function decide(change: Change, policy: Policy, registry: Registry, today: string): Decision {
    const fixed: string[] = []; // reasons no exception can lift
    const liftable: string[] = [];
    const published: string | undefined = registry[change.name]?.[change.to];
    if (published === undefined) fixed.push("not in registry");
    const ms = published !== undefined && ISO.test(published) ? Date.parse(published) : NaN;
    if (published !== undefined && Number.isNaN(ms)) fixed.push("publish date unknown");
    if (!onAllowlist(change.name, policy.allowlist)) liftable.push("not on allowlist");
    if (!Number.isNaN(ms)) {
        const day = new Date(ms).toISOString().slice(0, 10);
        const ends = new Date(Date.parse(`${day}T00:00:00Z`) + policy.quarantineDays * DAY).toISOString().slice(0, 10);
        if (today < ends) liftable.push(`quarantined until ${ends} (published ${day})`);
    }
    const reasons = [...fixed, ...liftable];
    if (reasons.length === 0) return { allow: true, reasons: [] };

    const matching = policy.exceptions.filter((e) => e.name === change.name && e.version === change.to);
    const valid = matching.find((e) => isDate(e.expires) && today < e.expires);
    if (valid && fixed.length === 0) return { allow: true, reasons: [`exception ${valid.ticket} (expires ${valid.expires})`] };
    if (!valid && matching.length > 0) reasons.push(`exception ${matching[0].ticket} not valid (expires ${matching[0].expires})`);
    return { allow: false, reasons };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "today": "YYYY-MM-DD", "policy": {...}, "registry": {...}, "changes": [...] }.
// Prints one line per change in input order, then the totals.
const input: { today: string; policy: Policy; registry: Registry; changes: Change[] } = JSON.parse(readFileSync(0, "utf8"));
let allowed = 0;
for (const change of input.changes) {
    const d = decide(change, input.policy, input.registry, input.today);
    if (d.allow) allowed++;
    const was = change.from ? ` (was ${change.from})` : "";
    const why = d.reasons.length ? `: ${d.reasons.join("; ")}` : "";
    console.log(`${d.allow ? "allow" : "block"} ${change.name}@${change.to}${was}${why}`);
}
console.log(`${allowed} allowed, ${input.changes.length - allowed} blocked`);
