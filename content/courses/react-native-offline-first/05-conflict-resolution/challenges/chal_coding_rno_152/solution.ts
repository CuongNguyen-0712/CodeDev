import { readFileSync } from "node:fs";

// Rice Rocket courier app: a delivery the courier edited offline comes back online while the
// dispatcher may have changed it on the web. The app keeps `base`, the version the courier's edit
// started from, so each field can be merged on its own (three-way merge):
//   base    the delivery as the phone last synced it
//   local   the courier's edited copy             remote  the api's current copy
//   policy  per field, who wins when both sides changed it to different values:
//           "server" (the api's value; tell the courier), "device" (the courier's value),
//           "union" (a list: keep the items of both); a field with no policy acts like "server".
// `updatedAt` is not merged: device clocks are often wrong, so it never decides anything.
type Value = string | number | string[] | null;
type Delivery = Record<string, Value>;
type Policy = "server" | "device" | "union";
interface Merge { merged: Delivery; conflicts: string[] }

const same = (a: Value | undefined, b: Value | undefined): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function mergeDelivery(base: Delivery, local: Delivery, remote: Delivery, policy: Record<string, Policy>): Merge {
    const merged: Delivery = { updatedAt: remote.updatedAt ?? null };
    const conflicts: string[] = [];
    const fields = [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])].filter((f) => f !== "updatedAt").sort();
    for (const f of fields) {
        // @piece only-server-changed: The courier did not touch it: take the api's value
        if (same(local[f], base[f])) {
            merged[f] = remote[f] ?? null;
            continue;
        }
        // @end
        // @piece only-courier-changed: Only the courier changed it: keep the edit
        if (same(remote[f], base[f])) {
            merged[f] = local[f] ?? null;
            continue;
        }
        // @end
        if (same(local[f], remote[f])) {
            merged[f] = local[f] ?? null;
            continue;
        }
        // @piece both-changed: Both changed it: apply the field's policy
        const rule = policy[f] ?? "server";
        if (rule === "device") merged[f] = local[f] ?? null;
        else if (rule === "union") merged[f] = unionOf(local[f], remote[f]);
        else {
            merged[f] = remote[f] ?? null;
            conflicts.push(f);
        }
        // @end
    }
    return { merged, conflicts };
}

function unionOf(a: Value | undefined, b: Value | undefined): string[] {
    // @piece union-lists: The items of both lists, each once, sorted
    return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])].sort();
    // @end
}

// ---------------------------------------------------------------- test runner (do not change)
interface Case { base: Delivery; local: Delivery; remote: Delivery; policy: Record<string, Policy> }
const input = JSON.parse(readFileSync(0, "utf8")) as Case;
console.log(JSON.stringify(mergeDelivery(input.base, input.local, input.remote, input.policy)));
