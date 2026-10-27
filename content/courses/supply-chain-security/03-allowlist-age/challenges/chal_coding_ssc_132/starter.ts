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

// Write decide (helpers are welcome). Do not change the types or the test runner.
function decide(change: Change, policy: Policy, registry: Registry, today: string): Decision {
    return { allow: true, reasons: [] };
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
