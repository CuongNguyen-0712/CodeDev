// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-4-2",
    title: "Multi-window burn-rate alerts",
    slug: { _type: "slug", current: "multi-window-burn-rate-alerts" },
    description:
        "The first SLO alert at CodeDev paged when the 28-day SLI fell below 99.5%, so a 40-minute grader outage spent 39% of the error budget without paging anyone. Learn burn rate (error ratio divided by the error budget), why one window is either too slow or too noisy, and the multi-window, multi-burn-rate policy from the Google SRE Workbook: page at 14.4x over 1 h confirmed by 5 min and at 6x over 6 h confirmed by 30 min, ticket at 1x over 3 days confirmed by 6 h, with a minimum request count for quiet hours.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on call, CodeDev learning platform",
        problem:
            "Thursday 14:00. Half of the grader's sandbox workers on https://api.codedev.test fail their health checks after a node pool upgrade, and 30% of POST /submissions requests answer 503 for 40 minutes. The team adopted the submit SLO (99.5% of valid requests good over a rolling 28 days) two weeks ago, together with its first alert: page when the 28-day SLI drops below 99.5%. The alert stays silent. Learners report the failures on the community Discord at 14:20, support forwards a screenshot at 14:31, and the on-call engineer rolls back the node pool at 14:38. The error budget panel shows 56% left at 13:59 and 17% at 14:41.",
    },

    content: [
        h2("1. The incident: an SLO alert that waits for the end of the month"),
        p("The alert rule looked reasonable in review. It alerts on the SLO itself, so it can never fire for something learners do not feel:"),
        code("yaml", `
# prometheus/rules/slo-submit-alerts.yml (first version)
- alert: SubmitSLOViolated
  expr: slo:submit_sli:ratio_rate28d < 0.995
  labels:
    severity: page`, "slo-submit-alerts.yml"),
        p("And this is what the Thursday outage did to the numbers it watches:"),
        code("text", `
time    submit req/min   bad req/min   28-day SLI   budget left
13:59   2,000            2             99.780%      56%
14:10   2,000            600           99.732%      46%
14:20   2,000            600           99.683%      37%
14:30   2,000            600           99.635%      27%
14:41   2,000            2             99.586%      17%
alert SubmitSLOViolated: never fired (threshold 99.500%)`, "thursday-1400.txt"),
        p("Forty minutes, 24,000 failed submissions, 39% of the 28-day budget gone, and the SLI moved by less than two tenths of a percent. A 28-day average is the right thing to report on and the wrong thing to alert on: by the time it crosses the line, the budget is already exhausted, and it stays across the line for weeks after the problem is fixed."),
        p("The opposite design, paging when the error ratio of the last minute is high, reacts within a minute but cannot tell a one-minute blip from an outage. Lesson 12 is about what that does to an on-call rotation. This lesson builds the alert in between."),

        h2("2. Reproduce it: the same outage through different windows"),
        p("Take the outage and compute the error ratio over windows of different lengths, for the minute ending at 14:15 (15 minutes into the outage, which ran from 14:00 to 14:40) and for the minute ending at 14:45 (5 minutes after recovery). Traffic is a steady 2,000 requests per minute and the baseline error ratio is 0.1%:"),
        code("text", `
window   at 14:15 (outage running)          at 14:45 (outage over)
1 min    600 / 2,000      = 30.0%           2 / 2,000        = 0.1%
5 min    3,000 / 10,000   = 30.0%           10 / 10,000      = 0.1%
1 h      9,090 / 120,000  = 7.6%            24,040 / 120,000 = 20.0%
28 d     99.71% good                        99.59% good`, "windows.txt"),
        callout("info", "How to read this table",
            "The exact numbers matter less than the pattern. Short windows see the outage start within a minute and see it end within a few minutes. The 1-hour window sees it start more slowly, keeps reporting it for an hour after it ended, and is the window in which 24,000 failures actually look like a problem. The 28-day window barely moves at all."),
        p("Each window answers a different question. The long window answers **\"has enough budget been spent to matter?\"**; the short window answers **\"is it still happening?\"**. A good page needs a yes to both."),

        h2("3. Burn rate: how fast you spend the budget"),
        p("The SRE Workbook expresses both answers with one unit, the **burn rate**: how fast the service spends its error budget compared with the rate that would spend exactly all of it by the end of the SLO window."),
        code("text", `
burn rate = error ratio in the window / (1 - SLO)

SLO 99.5% -> error budget 0.5%
error ratio 0.5%  -> burn rate 1     the budget lasts exactly 28 days
error ratio 1.0%  -> burn rate 2     the budget is gone in 14 days
error ratio 30%   -> burn rate 60    the budget is gone in 28 d / 60 = 11.2 hours

budget spent in a window = burn rate x window / SLO period
1 h at burn rate 14.4 = 14.4 x 1 h / 672 h = 2.1% of a 28-day budget`, "burn-rate.txt"),
        p("Burn rate makes an alert threshold mean something. \"Page when the error ratio over 1 hour exceeds 7.2%\" is an arbitrary number; \"page when the last hour spent the budget 14.4 times too fast\", which is the same rule for a 99.5% SLO, says why it matters and stays correct if the SLO changes."),
        h3("The policy from the SRE Workbook"),
        p("The Workbook's recommended starting point uses three pairs of windows. Its percentages are for a 30-day SLO (720 hours): 14.4x for 1 hour spends 2% of the budget, 6x for 6 hours 5%, 1x for 3 days 10%. CodeDev keeps the same factors and windows with its 28-day SLO, which makes each one a little more sensitive:"),
        code("text", `
rule      severity  burn rate  long window  short window  error ratio (99.5%)  budget spent (28 d)
burn-1h   page      14.4       1 h          5 min         7.2%                 2.1%
burn-6h   page      6          6 h          30 min        3.0%                 5.4%
burn-3d   ticket    1          3 days       6 h           0.5%                 10.7%

fires when: burn rate(long window) > factor AND burn rate(short window) > factor`, "burn-rate-policy.txt"),
        bullets([
            "**Multiple burn rates** cover different failures. burn-1h catches outages fast; burn-6h catches a serious partial failure that a 1-hour window does not show yet; burn-3d catches a slow leak, like a release that fails 0.8% of submissions forever, which no fast rule ever sees.",
            "**Severity follows urgency.** At 14.4x the whole budget is gone in under two days: wake someone up. At 1x it is gone by the end of the window: a ticket that the team handles during working hours is enough.",
            "**The short window is 1/12 of the long one** in the Workbook's examples. It barely delays detection, because during a real incident the short window's ratio is at least as high as the long one's, and it makes the alert stop within minutes of recovery instead of an hour later.",
        ]),
        h3("Detection time and reset time"),
        p("For an error ratio `e` that starts suddenly, the long window crosses its threshold after roughly `factor x (1 - SLO) / e x long window`. For Thursday's 30% outage: 14.4 x 0.005 / 0.3 x 60 min = 14.4 minutes, so burn-1h would have paged at about 14:14, before the first Discord message. A total outage (100%) pages after about 4.3 minutes; an error ratio below 7.2% never triggers burn-1h at all and is left to the slower rules, which is exactly the trade-off the policy makes."),
        p("Reset time is the other half. With the 5-minute confirmation window, the page resolves about 5 minutes after recovery. Without it, the 1-hour window keeps the alert firing for up to an hour after the rollback, the on-call engineer cannot tell whether the fix worked, and a second incident in that hour is invisible."),
        h3("Low traffic: when a ratio stops meaning anything"),
        p("At 03:00 the submit endpoint sees about 15 requests a minute. Two failures in five minutes is a 2.7% error ratio and a burn rate above 5 from two requests, possibly from one learner's broken script. The Workbook discusses remedies such as generating synthetic traffic and combining small services into one SLO; another common one is to require a minimum number of events before an alert can fire. CodeDev uses that one: **a rule fires only when both of its windows contain at least 100 requests**. At night the 5-minute window falls below that, so burn-1h cannot page on a handful of requests, while burn-6h, with its 30-minute short window, still sees a real night outage."),
        callout("warning", "When not to use burn-rate alerts",
            "They need an SLO that people agreed on (lesson 10) and enough traffic for a ratio to be meaningful. For a batch job, alert on what it promises instead (\"leaderboard rebuilt by 06:00\"). For an endpoint with a few requests per hour, use synthetic probes or merge it into a larger journey before you alert on its ratio."),

        challenge("chal_quiz_otl_421"),

        h2("4. Worked example: the rules in Prometheus"),
        p("Building on the recording rules from lesson 10, define the error ratio over each window the policy uses, then one alert per rule. The windows are 5m, 30m, 1h, 6h and 3d; only the 1h version is written out here:"),
        code("yaml", `
# prometheus/rules/slo-submit-alerts.yml
groups:
  - name: slo-submit-burn
    rules:
      - record: slo:submit_error_ratio:rate1h
        expr: |
          1 - (
            sum(rate(http_server_request_duration_seconds_bucket{
              http_request_method="POST", http_route="/submissions",
              http_response_status_code!~"[45]..", le="2"}[1h]))
            /
            sum(rate(http_server_request_duration_seconds_count{
              http_request_method="POST", http_route="/submissions",
              http_response_status_code!~"4.."}[1h]))
          )
      # ... the same for 5m, 30m, 6h and 3d

      - alert: SubmitBurnRate1h
        expr: |
          slo:submit_error_ratio:rate1h > (14.4 * 0.005)
          and slo:submit_error_ratio:rate5m > (14.4 * 0.005)
          and on() sum(increase(http_server_request_duration_seconds_count{
                http_request_method="POST", http_route="/submissions",
                http_response_status_code!~"4.."}[5m])) >= 100
        labels:
          severity: page
        annotations:
          summary: "POST /submissions is spending its 28-day error budget more than 14.4x too fast"
          runbook: "https://app.codedev.test/runbooks/submit-slo"`, "slo-submit-alerts.yml"),
        bullets([
            "**No `for:` clause.** The short window already confirms that the problem is real and current; adding `for: 5m` on top only delays the page.",
            "**The minimum traffic check uses the short window**: it is the smaller of the two, so when it has 100 requests, the long window has at least as many.",
            "**Long windows are expensive.** A `rate(...[3d])` over raw histogram buckets reads three days of samples on every evaluation. Teams often keep the 3-day ratio in its own recording rule evaluated less often, or compute it from pre-aggregated counters; whatever you choose, test that it gives the same ratio as the direct query on a past week.",
            "**The runbook link is part of the alert.** A page at 03:00 should say what is burning, how fast, and what to check first.",
        ]),
        p("Before trusting the rules, replay them. With per-minute counts of good and bad requests from past weeks, you can compute exactly when each rule would have fired and stopped, and compare that with what you know happened. A short helper makes the numbers in the policy table easy to check:"),
        code("typescript", `
const SLO = 0.995;

// minutes until a sudden error ratio e makes the long window cross factor x budget
function detectionMinutes(e: number, factor: number, longMinutes: number): number | null {
    const threshold = factor * (1 - SLO);
    return e > threshold ? (threshold / e) * longMinutes : null;   // null: this rule never fires
}

console.log(detectionMinutes(0.30, 14.4, 60));   // ~14.4 - Thursday's outage, burn-1h
console.log(detectionMinutes(1.00, 14.4, 60));   // ~4.3  - total outage
console.log(detectionMinutes(0.05, 14.4, 60));   // null  - left to burn-6h
console.log(detectionMinutes(0.05, 6, 360));     // ~216  - burn-6h, after 3.6 hours`, "detection.ts"),
        p("Now build the replay itself: it is the tool you will use in the next lesson to prove that a new alert policy would have behaved better than the old one on real weeks of traffic."),

        challenge("chal_coding_otl_422"),

        h2("5. How to verify burn-rate alerts"),
        bullets([
            "**Replay recorded weeks.** Run the policy over the per-minute counts of the last few weeks and list every page and ticket it would have sent. Every page should match a moment someone would agree was worth waking up for; every known incident should appear.",
            "**Check the detection table.** For a 100% outage, a 30% outage and a 5% partial failure, compute when each rule should fire (as above) and confirm the replay agrees to within a minute or two.",
            "**Inject a failure in staging.** Make the grader return 503 for a fixed share of requests with synthetic traffic above the minimum, and watch the alert fire, then resolve within about one short window after you stop.",
            "**Test the rules themselves.** `promtool test rules` evaluates Prometheus alert rules against synthetic series you write in a test file, so a typo in a label or a factor fails in CI instead of at 03:00.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Alerting on the SLO window itself.** The 28-day SLI crossing 99.5% means the budget is already gone. Spot it: the alert fires days after the incident, or never.",
            "**Dropping the short window.** The alert keeps firing up to an hour after recovery. Spot it: alerts that resolve long after the rollback, and on-call engineers who stop trusting the resolve notification.",
            "**Confusing the burn rate with the error percentage.** \"14.4\" is not \"14.4% errors\"; for a 99.5% SLO the burn-1h threshold is 7.2%. Spot it: a threshold written as `> 0.144` in the rule.",
            "**Paging on the slowest rule.** A 1x burn over 3 days is a ticket, not a 03:00 page. Spot it: pages that nobody can act on before the morning.",
            "**No minimum traffic.** Spot it: pages at night where the alert annotation shows a high ratio and a total of a few dozen requests.",
        ]),

        h2("7. Summary"),
        numbered([
            "Burn rate = error ratio / (1 - SLO): 1 spends exactly the budget over the SLO window; an alert threshold written as a burn rate says how fast the budget is going and survives a change of SLO.",
            "Fire only when a long window (enough budget spent) and a short window (still happening) both exceed the factor: 14.4x over 1 h with 5 min and 6x over 6 h with 30 min page, 1x over 3 days with 6 h opens a ticket.",
            "Require a minimum number of requests in the windows so quiet hours cannot page, and replay recorded weeks before you trust a policy.",
        ]),

        h2("Sources"),
        bullets([
            "Google SRE Workbook, chapter \"Alerting on SLOs\": burn rate, multiple windows and burn rates, low-traffic services - sre.google/workbook/alerting-on-slos/",
            "Prometheus documentation: alerting rules and unit testing rules with promtool",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Write the same three rules for a second CodeDev SLO, \"open a lesson\" at 99.9% over 28 days: the error ratio thresholds, the budget each rule spends before it fires, and the detection time for a 2% and a 20% failure. Then write one promtool test that feeds a 30-minute outage at 25% errors and checks that SubmitBurnRate1h fires and resolves."),
    ],
});
