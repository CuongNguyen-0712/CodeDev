// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-fwp-3-3",
    title: "Performance budgets in CI",
    slug: { _type: "slug", current: "performance-budgets-lighthouse-ci" },
    description:
        "Rice Rocket's Lighthouse CI job measured every pull request and failed none of them, so a 600 KB analytics bundle and an image without dimensions reached production. Learn to turn lab measurements into budgets: several runs and the median, assertions per page, error vs warn, and a regression check against main that catches growth before it crosses the budget.",
    estimatedTime: 15,

    scenario: {
        role: "Frontend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "After the work of the previous lessons, real-user LCP and INP were good. Two weeks later they were not: a marketing pull request added a tag manager bundle to every page, and a redesigned restaurant header shifted the layout. The CI job had printed both scores in its log, green.",
    },

    content: [
        h2("Situation"),
        code("text", `
$ lhci autorun
✅  .lighthouseci/ directory writable
Running Lighthouse 3 time(s) on http://localhost:3000/restaurants/com-tam-ba-ghien
Run #1...done.  Run #2...done.  Run #3...done.
Done running Lighthouse!
Uploading median LHR of http://localhost:3000/restaurants/com-tam-ba-ghien...success!
# no assertions configured: exit code 0`, "CI log (illustrative)"),
        bullets([
            "The median run had LCP 2.8 s and CLS 0.21; nothing compared them with anything.",
            "Script on `/checkout` grew from 150 KB to 162 KB in one pull request and to 410 KB over a month, each step small enough to look harmless.",
            "When a single run was slow (a cold container in CI), people learned to re-run the job instead of reading it.",
        ]),

        h2("The core you need"),
        bullets([
            "**Lab data is noisy, so take several runs.** Three to five runs per page and the median (Lighthouse CI's `median-run` aggregation) keep one slow run from failing a pull request, and one lucky run from passing it.",
            "**A budget is an assertion per page and metric.** LCP, TBT (the lab stand-in for INP) and CLS for the user-facing timings; bytes of script and images for what causes them. Patterns let one budget cover all restaurant pages.",
            "**Levels decide what blocks a merge.** `error` fails the job; `warn` reports without failing. Use `warn` for metrics that are noisy in CI (TBT on shared runners) and `error` for the ones you trust (bytes, CLS).",
            "**Regressions against main catch the slow creep.** A budget only fires when a page crosses it; comparing with the last report on main (\"script grew more than 5%\") fails the step that caused the growth, while the page is still under budget.",
            "**Field data has the last word.** CI budgets protect against regressions you can reproduce in a lab; the RUM numbers from lesson 1 tell you whether users feel them.",
        ]),

        h2("Apply it in the project"),
        code("json", `
{
  "ci": {
    "collect": {
      "startServerCommand": "npm run start",
      "url": ["http://localhost:3000/", "http://localhost:3000/restaurants/com-tam-ba-ghien", "http://localhost:3000/checkout"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500, "aggregationMethod": "median-run" }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1, "aggregationMethod": "median-run" }],
        "total-blocking-time": ["warn", { "maxNumericValue": 200, "aggregationMethod": "median-run" }],
        "resource-summary:script:size": ["error", { "maxNumericValue": 174080 }]
      }
    }
  }
}`, "lighthouserc.json"),
        p("Lighthouse CI applies assertions to every collected URL (per-URL settings use `assertMatrix`; hedge the exact options for your version). The regression check against main is a small script that runs after `lhci collect`, reading the same reports:"),
        code("yaml", `
- run: npx lhci collect && npx lhci assert
- run: node scripts/check-budgets.js .lighthouseci baseline/main.json   # budgets per page + growth vs main`, ".github/workflows/ci.yml (excerpt)"),
        callout("info", "Where the baseline comes from",
            "On every merge to main, the same job uploads its summarized report as an artifact (or to an LHCI server). Pull requests download the latest one; a page that is new on the branch simply has no baseline yet."),

        h2("Verify"),
        code("text", `
$ node scripts/check-budgets.js .lighthouseci baseline/main.json
error /checkout scriptKB +8% vs main (150 -> 162)
error /restaurants/com-tam-ba-ghien lcp 2810 > 2500
warn /restaurants/com-tam-ba-ghien tbt 240 > 200
$ echo $?
1`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Budgets set at today's numbers plus nothing.** A budget equal to the current value fails on noise. Start with the current median plus a margin, then tighten as you improve.",
            "**Testing a different build than you ship.** `next dev` is unminified and slow; run Lighthouse CI against `next build && next start` (or a preview deployment), or the numbers mean nothing.",
            "**Averaging runs.** The mean of [2.2 s, 2.1 s, 5.9 s] is 3.4 s, a failure caused by one cold start. Use the median, and look at the run spread before raising a budget.",
        ]),

        p("Now write the budget check. The editor holds `scripts/check-budgets.js` with its blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run checks reports built from three runs per page against main's report."),
        challenge("chal_coding_fwp_182"),
    ],
});
