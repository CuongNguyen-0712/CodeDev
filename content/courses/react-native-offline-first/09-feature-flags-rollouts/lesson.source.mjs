// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-3-3",
    title: "Feature flags and staged rollouts",
    slug: { _type: "slug", current: "react-native-feature-flags-staged-rollouts" },
    description:
        "Courier app 2.4 shipped a batch pickup screen that crashed on some Android phones, and the store rollback took two days. Learn how a mobile release is made safe: staged store rollouts, over-the-air updates and their runtime version, and remote feature flags evaluated on the phone, offline, with stable percentage buckets and a kill switch.",
    estimatedTime: 16,

    scenario: {
        role: "Mobile developer on Rice Rocket's courier app (React Native, Expo)",
        problem:
            "A mobile release cannot be rolled back like a web deploy: users keep the version they installed, and a store review can take days. When 2.4's new batch pickup screen crashed for some couriers mid-shift, the only lever the team had was waiting for a fixed build to be approved.",
    },

    content: [
        h2("Situation"),
        code("text", `
Crash reports, courier app 2.4.0 (first 6 hours)
  BatchPickupScreen  java.lang.IllegalStateException   Android 10   312 events, 141 couriers
Google Play: 2.4.0 at 100% (no staged rollout)
Fix: 2.4.1 submitted 14:10, approved next day 16:40
OTA attempt in between: crashed on 2.3 phones ("Native module BarcodeScanner cannot be found")`, "evidence"),
        bullets([
            "The new screen was not behind a flag, so it could not be switched off without a new binary.",
            "The release went to every courier at once instead of a small share first.",
            "An over-the-air update shipped JavaScript that needed a native module older binaries did not have.",
        ]),

        h2("The core you need"),
        bullets([
            "**Three levers, three speeds.** A store release (new native code, days with review, staged by percentage), an OTA update (new JavaScript and assets via EAS Update, minutes, only for binaries with the same runtime version), and a remote flag (on or off for a feature, the next time the app reads its config).",
            "**Staged rollouts control new installs, not old ones.** Google Play's staged rollout and the App Store's phased release raise the share of users over days and can be halted. Users who already updated keep the version; halting does not downgrade them.",
            "**Flags are evaluated on the phone.** The app downloads the flag config on start, saves it, and uses the saved copy when offline. With no config at all it uses defaults compiled into the app, so a fresh install offline still behaves sensibly.",
            "**Stable buckets.** Hash the flag key and the user id to a number from 0 to 99 and compare it with the rollout percentage. The same courier always gets the same answer, raising 10% to 25% only adds couriers, and including the flag key gives each flag its own sample.",
            "**Targeting and a kill switch.** Rules match the platform, a minimum app version (compared number by number: 2.10.0 is newer than 2.4.0) and OS versions. A killed flag is off for everyone, whatever the rollout says.",
        ]),

        h2("Apply it in the project"),
        p("The batch pickup entry point checks the flag; the screen itself stays in the binary but is unreachable when the flag is off:"),
        code("ts", `
// src/flags/isEnabled.ts (the challenge below), used through a small hook
export function useFlag(key: FlagKey): boolean {
  const user = useCourier();
  return useMemo(() => isEnabled(key, user, remoteFlags, flagCache), [key, user]);
}

// src/screens/deliveries/DeliveriesScreen.tsx
const batchPickup = useFlag("batch-pickup");
{batchPickup && <Button title="Pick up several orders" onPress={() => navigation.navigate("BatchPickup")} />}`, "src/flags/useFlag.ts"),
        code("json", `
{
  "version": 7,
  "flags": {
    "batch-pickup": {
      "enabled": true,
      "killed": false,
      "rollout": 10,
      "rules": [{ "platform": "android", "minAppVersion": "2.4.0" }]
    }
  }
}`, "flags/production.json (served by the api, cached on the phone)"),
        code("json", `
{
  "expo": {
    "runtimeVersion": { "policy": "fingerprint" },
    "updates": { "url": "https://u.expo.dev/<project-id>" }
  }
}`, "app.json (excerpt)"),
        callout("info", "Runtime version policies",
            "With a runtime version policy such as `fingerprint`, a change to native dependencies produces a new runtime version, so EAS Update never sends JavaScript to a binary that lacks the native code it needs. Check the policies your Expo SDK supports before relying on one."),

        h2("Verify"),
        code("bash", `
# Release 2.4.2 to 5% of Android users first
#   Play Console: production track -> 2.4.2 -> staged rollout 5% (raise after a crash-free day)
# Turn batch pickup on for 10% of eligible couriers, watch crash-free sessions, then raise
curl -s https://api.ricerocket.vn/flags | jq '.flags["batch-pickup"]'
#   { "enabled": true, "killed": false, "rollout": 10, ... }
# Kill switch drill on a test phone: set "killed": true, restart the app -> the button is gone;
# airplane mode, restart -> still gone (the saved config is used)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Flags that default to on when offline.** If the app cannot load a config and falls back to \"on\", a killed feature comes back for every courier in a dead zone. Default risky features to off and save the last config.",
            "**Comparing versions as text.** `\"2.10.0\" >= \"2.4.0\"` is false as a string comparison. Test the version rule with a two-digit minor version.",
            "**Shipping native changes over the air.** Any new or upgraded native module needs a store build. Detect the mistake before it ships: the runtime version must change, and an update built for the old runtime must not reach the new binary (or the reverse).",
        ]),

        challenge("chal_quiz_rno_191"),
        p("Now write the flag check. The editor holds `isEnabled(key, user, remote, cache)` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run starts the app for a few dozen couriers, online and offline, while the flag config changes, and lists who gets each feature."),
        challenge("chal_coding_rno_192"),
    ],
});
