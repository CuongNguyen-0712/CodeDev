// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-kma-3-3",
    title: "Feature flags and safe rollouts",
    slug: { _type: "slug", current: "kotlin-feature-flags-safe-rollouts" },
    description:
        "Rice Rocket shipped the batch-delivery screen switched on in code; it crashed on some phones and halting the Play rollout did not stop it. Learn the difference between a staged release and a flag, how a kill switch, compatibility checks and stable bucketing decide who gets a feature, and why defaults must be safe.",
    estimatedTime: 16,

    scenario: {
        role: "Android developer on Rice Rocket's courier app, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Batch delivery lets a courier carry two orders at once. Version 2.5.0 turned it on for everyone who installed it; on older phones the screen crashed, and the fix needed a new release and days of update adoption.",
    },

    content: [
        h2("Situation"),
        code("text", `
14:00  Play Console  2.5.0 production, staged rollout 20%
14:05  Crashlytics   BatchDeliveryScreen NullPointerException (Android 10, app 2.5.0)
14:10  rollout halted
16:00  1,240 couriers affected and rising: phones that already updated keep 2.5.0
Day 3  2.5.1 reaches 80% of couriers`, "incident timeline"),

        h2("The core you need"),
        bullets([
            "**A release and a flag are different switches.** A Play staged rollout limits who can download a version; once installed, the code stays on the phone. A remote flag decides at run time whether installed code runs, so it can turn a feature off in minutes.",
            "**Remote config with safe defaults.** Firebase Remote Config (or any flag service) fetches values and caches them; `setDefaultsAsync` gives the values used before the first successful fetch and whenever it fails. Risky features default to off.",
            "**An order of checks.** Kill switch first (off for everyone, QA included); then compatibility (minimum app version compared number by number, minimum Android SDK) so a feature never runs where it cannot; then an allowlist for QA couriers; then the percentage rollout.",
            "**Stable buckets.** `hash(flagKey + \":\" + courierId) mod 100` puts each courier in a fixed bucket per flag: the same answer on every launch, more couriers as the percentage grows, and different flags choosing different couriers. A random draw per launch flips couriers between screens.",
            "**Flags are debt.** Each flag doubles the code paths to test. Remove it, and the old path, once the rollout is at 100% and stable.",
        ]),

        h2("Apply it in the project"),
        code("kotlin", `
class FlagRepository @Inject constructor(private val rc: FirebaseRemoteConfig) {
    init {
        rc.setDefaultsAsync(mapOf("batch_enabled" to false, "batch_percent" to 0L, "batch_min_version" to "2.5.1", "batch_min_sdk" to 30L))
    }
    suspend fun refresh() = runCatching { rc.fetchAndActivate().await() }     // failure keeps cached or default values

    fun batchDelivery(): Flag = Flag(
        key = "batch-delivery",
        enabled = rc.getBoolean("batch_enabled"),
        percent = rc.getLong("batch_percent").toInt(),
        minVersion = rc.getString("batch_min_version"),
        minSdk = rc.getLong("batch_min_sdk").toInt(),
        allow = rc.getString("batch_allowlist").split(",").filter { it.isNotBlank() }.toSet(),
    )
}

// in the order screen's view model, read once per screen, not in a list item
val showBatch = evaluate(flags.batchDelivery(), Courier(session.courierId, BuildConfig.VERSION_NAME, Build.VERSION.SDK_INT)).on`, "FlagRepository.kt"),
        callout("info", "Staged rollouts still matter",
            "Use both: a staged release limits how many phones get new code at all, and the flag inside it lets you switch the feature off without waiting for the next release."),

        h2("Verify"),
        code("bash", `
./gradlew :core:flags:testDebugUnitTest
# FlagEvaluationTest > killSwitchBeatsAllowlist PASSED
# FlagEvaluationTest > bucketIsStablePerCourierAndFlag PASSED
# FlagEvaluationTest > versionCompareIsNumeric PASSED
adb shell am start -n vn.ricerocket.courier/.MainActivity --ez debug_flags true   # debug menu shows each flag and its reason`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Comparing versions as text.** `\"2.10.0\" < \"2.9.0\"` as strings, so newer apps are treated as too old. Split on dots and compare numbers; test 2.9 against 2.10.",
            "**An allowlist that beats the kill switch.** QA phones keep the crashing feature after it is killed, and so does anyone added to the list in a hurry. Kill switch first, always.",
            "**Reading flags everywhere.** A flag read in a list item or a hot loop can change mid-session after a fetch. Read it once per screen (or per session) and pass the decision down.",
        ]),

        challenge("chal_quiz_kma_191"),
        p("Now write the evaluation. The editor starts from `Flags.kt` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run evaluates flags for a set of couriers and prints each decision with its reason."),
        challenge("chal_coding_kma_192"),
    ],
});
