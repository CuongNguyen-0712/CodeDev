// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-fwp-1-1",
    title: "Core Web Vitals from real users: LCP, INP and CLS",
    slug: { _type: "slug", current: "core-web-vitals-real-users" },
    description:
        "Rice Rocket's ordering site scored 98 in Lighthouse, yet Search Console flagged its menu page as poor on Interaction to Next Paint. Learn what LCP, INP and CLS measure, why the assessment uses the 75th percentile of real visits, and how the web-vitals attribution build points at the element to fix, then summarize a day of RUM beacons.",
    estimatedTime: 15,

    scenario: {
        role: "Frontend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The ordering site (Next.js, React 19) felt fast on the team's laptops. Customers on budget Android phones complained that \"Add to cart\" lagged, and Search Console's Core Web Vitals report listed the menu page as poor on INP. Nobody could say which pages or which elements were to blame.",
    },

    content: [
        h2("Situation"),
        p("Two reports about the same page, the same week:"),
        code("text", `
Lighthouse (desktop, no throttling)          Search Console - Core Web Vitals (mobile)
  Performance               98                 /menu   INP   Poor          560 ms (75th percentile)
  Largest Contentful Paint  0.9 s              /menu   LCP   Needs impr.   3.1 s
  Total Blocking Time       30 ms              /       CLS   Good          0.08`, "two reports"),
        bullets([
            "The lab score measures one page load on a fast machine with nobody tapping anything.",
            "The field report measures real visits on real phones, at the 75th percentile, and it is the one Google's assessment and the customers see.",
            "The team had no data of its own to say which element on /menu made the taps slow.",
        ]),

        h2("The core you need"),
        bullets([
            "**Three metrics, three questions.** LCP (Largest Contentful Paint): when did the main content appear? INP (Interaction to Next Paint): how long after a tap, click or key press until the next frame shows the result? CLS (Cumulative Layout Shift): how much did content jump around?",
            "**Thresholds.** Good when LCP is at most 2.5 s, INP at most 200 ms and CLS at most 0.1; poor above 4 s, 500 ms and 0.25; in between needs improvement.",
            "**The 75th percentile of real visits decides.** A page passes when three visits in four are good, per metric and per device type. Averages hide the slow quarter, and lab tests cannot measure INP at all because nobody interacts.",
            "**Collect your own field data with web-vitals.** `onLCP`, `onINP` and `onCLS` report each metric once per visit, and report INP and CLS again when they get worse; each report carries an `id` for that visit's metric, so the last report of an id is the one to keep.",
            "**Attribution says what to fix.** The attribution build adds the LCP element, the interaction target and the phases of a slow interaction (input delay, processing duration, presentation delay), or the element that shifted.",
        ]),

        h2("Apply it in the project"),
        p("Send every metric from the browser with `sendBeacon`, so a report survives the tab being closed:"),
        code("ts", `
// app/vitals.ts, loaded once from the root layout (a client component)
import { onCLS, onINP, onLCP, type MetricWithAttribution } from "web-vitals/attribution";

function send(metric: MetricWithAttribution) {
  const a = metric.attribution as Record<string, unknown>;
  const target = (a.target ?? a.interactionTarget ?? a.largestShiftTarget ?? "") as string;
  navigator.sendBeacon("/api/rum", JSON.stringify({
    page: location.pathname, name: metric.name, id: metric.id, value: metric.value, target,
  }));
}

onLCP(send);
onINP(send);
onCLS(send);`, "app/vitals.ts"),
        p("The nightly job keeps the last report per id, groups by page and metric, and reads the 75th percentile:"),
        code("js", `
const latest = new Map();
for (const b of beacons) latest.set(b.id, b);          // INP / CLS arrive again as they grow
// group by \`\${page} \${name}\`, then per group:
const values = samples.map((s) => s.value).sort((a, b) => a - b);
const p75 = values[Math.ceil(values.length * 0.75) - 1];`, "rum/summarize.js"),
        callout("info", "Why not just use CrUX?",
            "The Chrome UX Report gives the same 75th percentiles for free, but only for pages with enough traffic, only from Chrome, a month at a time and without attribution. Your own beacons answer the next day and name the element."),

        h2("Verify"),
        code("bash", `
# one day of beacons, summarized
node rum/summarize.js --day 2026-11-05
# /menu INP   p75 560 ms   poor                culprit button.add-to-cart
# /menu LCP   p75 3100 ms  needs-improvement   culprit img.dish-hero
# /     CLS   p75 0.08     good                culprit div.promo-banner`, "terminal"),
        p("Then reproduce the culprit in the lab: Chrome DevTools, Performance panel, CPU throttling 4x, tap \"Add to cart\" and look for the long task under the click."),

        h2("Pitfalls"),
        bullets([
            "**Counting every report.** INP and CLS are reported several times per visit; counting all of them over-weights long visits. Detect it when the number of samples is larger than the number of page views; keep the last report per `id`.",
            "**Reading averages.** A dashboard that shows the mean INP can be green while a third of visits are poor. Plot the 75th percentile (and the 95th for the long tail).",
            "**Mixing devices.** Desktop visits pull the numbers down. Split by device type (the beacon can include `navigator.userAgentData.mobile` where available) before comparing with Search Console's mobile report.",
        ]),

        challenge("chal_quiz_fwp_111"),
        p("Now summarize the beacons. The editor holds `rum/summarize.js` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces are wrong on purpose. Run feeds it several days of beacons, including INP reports that grow during a visit and values that sit exactly on a threshold."),
        challenge("chal_coding_fwp_112"),
    ],
});
