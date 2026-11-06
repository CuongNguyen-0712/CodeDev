import { readFileSync } from "node:fs";

// Rice Rocket courier app: remote feature flags. On every start the app tries to download the flag
// config and keeps the last one it got (in MMKV here); couriers are often offline, so flags must work
// from that copy. A flag can target platforms and app/OS versions, roll out to a percentage of
// couriers, and be killed remotely. With no config at all, the defaults compiled into the app apply.
//   remote.fetch()   the current config, or null when the phone is offline
//   cache.load()     the last saved config, or null on a fresh install;  cache.save(config)
interface Rule { platform?: "ios" | "android"; minAppVersion?: string; maxOsVersion?: number }
interface Flag { enabled: boolean; killed: boolean; rollout: number; rules: Rule[] }
interface Config { version: number; flags: Record<string, Flag> }
interface User { id: string; platform: "ios" | "android"; appVersion: string; osVersion: number }
interface Remote { fetch(): Config | null }
interface Cache { load(): Config | null; save(config: Config): void }

const DEFAULTS: Record<string, boolean> = { "batch-pickup": false, "new-map": false, "cash-summary": true };

/** Whether the feature `key` is on for this courier on this start of the app. */
function isEnabled(key: string, user: User, remote: Remote, cache: Cache): boolean {
    // @piece current-config: The newest config available, online or offline
    const fresh = remote.fetch();
    if (fresh) cache.save(fresh);
    const config = fresh ?? cache.load();
    // @end
    const flag = config?.flags[key];
    if (!flag) return DEFAULTS[key] ?? false;
    // @piece kill-switch: A killed or disabled flag is off for everyone
    if (flag.killed || !flag.enabled) return false;
    // @end
    // @piece targeting: Only the platforms and versions the flag targets
    const targeted = flag.rules.length === 0 || flag.rules.some((rule) =>
        (rule.platform === undefined || rule.platform === user.platform) &&
        (rule.minAppVersion === undefined || compareVersions(user.appVersion, rule.minAppVersion) >= 0) &&
        (rule.maxOsVersion === undefined || user.osVersion <= rule.maxOsVersion));
    if (!targeted) return false;
    // @end
    // @piece rollout-bucket: The same couriers stay in as the percentage grows
    return bucket(`${key}:${user.id}`) < flag.rollout;
    // @end
}

/** 0-99 from FNV-1a (32 bit): the same input always gets the same bucket. */
function bucket(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h % 100;
}

/** Compares dotted versions numerically: -1, 0 or 1. */
function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { couriers, starts: [{ online, config? }], flags: [key] }
// Couriers u-1..u-N: every third one is on iOS, app versions cycle 2.3.1 / 2.4.0 / 2.10.0, OS version
// 9 + (n % 5). Each start of the app evaluates every flag for every courier against the same remote and
// cache (the cache survives restarts). Output per start: the couriers who get each flag.
const input = JSON.parse(readFileSync(0, "utf8")) as {
    couriers: number;
    starts: { online: boolean; config?: Config }[];
    flags: string[];
};
const versions = ["2.3.1", "2.4.0", "2.10.0"];
const users: User[] = [];
for (let n = 1; n <= input.couriers; n++) {
    users.push({ id: `u-${n}`, platform: n % 3 === 0 ? "ios" : "android", appVersion: versions[n % 3], osVersion: 9 + (n % 5) });
}
let saved: Config | null = null;
const cache: Cache = { load: () => (saved ? JSON.parse(JSON.stringify(saved)) as Config : null), save: (c) => { saved = JSON.parse(JSON.stringify(c)) as Config; } };
const out: Record<string, string[]>[] = [];
for (const start of input.starts) {
    const remote: Remote = { fetch: () => (start.online && start.config ? JSON.parse(JSON.stringify(start.config)) as Config : null) };
    const result: Record<string, string[]> = {};
    for (const key of input.flags) result[key] = users.filter((u) => isEnabled(key, u, remote, cache)).map((u) => u.id);
    out.push(result);
}
console.log(JSON.stringify(out));
