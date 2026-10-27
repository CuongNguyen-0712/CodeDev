// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-otl-4-3",
    title: "Fix it: an alert that wakes the team for nothing",
    slug: { _type: "slug", current: "fix-noisy-alert-wakes-team-for-nothing" },
    description:
        "The submit alert paged whenever more than 1% of one minute's requests failed: 14 pages in a week, every one a spike that was over before anyone opened a laptop, while a release quietly failed 0.8% of submissions for five days and spent 30% of the error budget. Read the pager log against the SLO, see why raising the threshold or adding for: 5m cannot fix both problems, replace the rule with the multi-window burn-rate policy, and prove it on recorded weeks before it ships.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, on-call retrospective, CodeDev learning platform",
        problem:
            "Monday morning, the weekly on-call handover. Last week the alert SubmitErrorRateHigh paged 14 times, twice at night; each page resolved by itself a minute later, and the on-call engineer wrote \"spike, no action\" on every one. Nobody was paged about the release 2026.10.21-2 that went out on Wednesday at 09:00: since then the grader has timed out on 0.8% of submissions with more than 40 tests, and learners have been filing \"my submission failed but passes locally\" tickets all week. The SLO panel for POST /submissions shows 41% of the 28-day error budget left on Monday and 10% left on Sunday night. The on-call engineer asks for one thing: an alert that pages when learners are hurt and stays quiet when they are not.",
    },

    content: [
        h2("1. The incident: 14 pages, zero actions, one silent leak"),
        p("The alert has been in place since the submit endpoint launched. It is short and easy to read, which is why nobody questioned it:"),
        code("yaml", `
# prometheus/rules/submit-alerts.yml (in production since 2025)
- alert: SubmitErrorRateHigh
  expr: |
    sum(rate(http_server_request_duration_seconds_count{
      http_request_method="POST", http_route="/submissions",
      http_response_status_code=~"5.."}[1m]))
    /
    sum(rate(http_server_request_duration_seconds_count{
      http_request_method="POST", http_route="/submissions"}[1m]))
    > 0.01
  labels:
    severity: page`, "submit-alerts.yml"),
        p("Here is last week's pager log, Monday 2026-10-19 to Sunday 2026-10-25, with the on-call notes:"),
        code("text", `
fired             resolved          value   requests in that minute   note
Mon 10:12         Mon 10:13         3.1%    424                       spike, no action
Mon 22:40         Mon 22:41         3.0%    231                       spike, no action
Tue 03:05         Tue 03:06         3.1%    130                       spike, no action (woken up)
Tue 15:31         Tue 15:32         3.2%    568                       spike, no action
Wed 09:02         Wed 09:03         3.1%    352                       spike, no action
Wed 13:47         Wed 13:48         3.0%    560                       spike, no action
... 7 more, all resolved after 1 minute, all "spike, no action"
Sun 19:44         Sun 19:45         3.0%    428                       spike, no action

POST /submissions, error ratio (5xx + slower than 2 s) per day
Mon 0.09%   Tue 0.08%   Wed 0.66%   Thu 0.77%   Fri 0.80%   Sat 0.81%   Sun 0.79%
error budget left (28 days, 99.5%): Mon 41% ... Sun 10%`, "pager-log-week-43.txt"),
        p("Two failures in one week, in opposite directions. The alert was **too sensitive**: it paged 14 times for events that needed nothing. And it was **blind**: the change that really hurt learners never crossed its line, because 0.8% is below 1% in every single minute, no matter how many minutes in a row it lasts."),

        h2("2. Read the evidence: what each failure cost"),
        p("Put both in the unit the SLO uses, failed requests, and compare them with the budget of about 62,000 failed requests per 28 days (lesson 10):"),
        bullets([
            "**The 14 spikes:** each one failed between 4 and 18 requests in a single minute. Together, 165 failed requests: about 0.3% of the budget, spread over a week. Each was real (a sandbox restart, a slow database failover), and each was over before a human could act.",
            "**The slow leak:** from Wednesday 09:00, 0.8% of every minute's requests failed. Over about 2.4 million requests in five days that is around 18,700 failed submissions: 30% of the whole 28-day budget, a hundred times what the spikes cost, with nobody paged and nobody ticketed.",
            "**The night pages:** at 03:05 the endpoint sees about 130 requests a minute, so 4 failures are already 3%. At low traffic a one-minute ratio is mostly noise.",
        ]),
        p("So the rule pages for the cheap events and ignores the expensive one. That is not a threshold that needs tuning; it is the wrong question. A one-minute error ratio asks \"did this minute look bad?\". The question an alert should ask is \"**is the error budget being spent fast enough that someone must act, and is it still happening?**\", which is exactly what a burn-rate rule measures."),
        callout("info", "Symptoms, not causes",
            "Burn-rate alerts are symptom alerts: they fire when learners are affected, whatever the cause. Keep a few cause alerts for problems that will hurt learners later but do not yet (a disk 90% full, a certificate expiring in 7 days), and send them as tickets, not pages."),

        h2("3. Why the quick fixes do not work"),
        p("Before the retro ended, three quick fixes were proposed. Test each one against both failures of the week:"),
        bullets([
            "**Raise the threshold to 5%.** The 3% spikes stop paging. The 0.8% leak is even further below the line, and a real 4% partial failure lasting all afternoon is now invisible too. It trades noise for blindness.",
            "**Add `for: 5m`.** The alert must be true for five evaluations in a row before it fires, so one-minute spikes stop paging. The leak is still below 1% and still invisible, every real outage pages five minutes later, and an outage that dips under 1% for one minute restarts the five-minute wait.",
            "**Use a longer window, `[1h] > 0.01`.** Spikes disappear in the hourly average. The leak (0.8%) still never crosses 1%, and after a real outage the alert keeps firing for up to an hour after the fix, because nothing says \"it stopped\".",
        ]),
        p("Each fix moves one knob of a rule that has only one window and one threshold. The week needs at least two different behaviours: a fast, loud reaction to a large burn and a slow, quiet reaction to a small one. That is the multi-window, multi-burn-rate policy from lesson 11."),
        callout("warning", "When not to change the alert",
            "If the pages had been actionable (each one a real outage that someone fixed), the fix would be in the service, not in the alert. Change an alert because of evidence about the alert: pages with no action, incidents with no page. Do not change it because a week of real outages was unpleasant."),

        challenge("chal_quiz_otl_431"),

        h2("4. The fix: replace the rule with the policy"),
        p("The replacement follows the SRE Workbook's recommended starting policy, with the SLO from lesson 10 (99.5% of valid submit requests are good, rolling 28 days) and a minimum of 100 requests in each window:"),
        code("text", `
rule      severity  burn rate > factor in BOTH windows    long window   short window
burn-1h   page      14.4                                 60 min        5 min
burn-6h   page      6                                    360 min       30 min
burn-3d   ticket    1                                    4,320 min     360 min

burn rate = (bad / total) / (1 - 0.995); a rule is checked only when both windows hold >= 100 requests`, "new-policy.txt"),
        p("Check the policy against the week before writing any code:"),
        bullets([
            "**A one-minute spike of 3%** raises the 1-hour error ratio by about 3% / 60 = 0.05%. burn-1h needs 7.2% over the hour: nowhere near. No page.",
            "**The 0.8% leak** is a burn rate of 1.6. Too slow for either page rule, but above 1: once enough of the 3-day window is covered by the leak, and while the last 6 hours still show it, burn-3d opens a ticket. That is the right severity: the budget would last 17.5 days at this rate, so there is time to fix it during working hours, but not to ignore it.",
            "**A night spike** of 4 failures in 130 requests: the 5-minute window holds about 650 requests and the 1-hour window barely moves. No page. On a quieter endpoint, with 15 requests a minute, the 5-minute window would hold fewer than 100 requests, and burn-1h could not fire on a handful of failures at all.",
            "**A real outage** of 30% for 25 minutes: burn-1h fires about 15 minutes in and resolves within about 5 minutes of recovery (lesson 11).",
        ]),
        h3("Prove it on recorded weeks before it ships"),
        p("A policy that looks right on paper can still surprise you on real traffic. The recorder already stores good and bad submit requests per minute, so the team replays past weeks through the old and the new rule and compares the output with what they know happened. A backtest over the four weeks before this one looked like this:"),
        code("text", `
$ npx tsx scripts/replay-alerts.ts --from 2026-09-21 --to 2026-10-18
weeks 39-42 (40,320 minutes)       old rule (1 min > 1%)    new policy
pages                              52                       2
tickets                            0                        1
known incidents paged              2 of 2                   2 of 2
pages with "no action" in the log  50                       0
median time to page, real outage   1 min                    11 min`, "backtest.txt"),
        p("Read the last line honestly: the new policy pages later for a real outage, about ten minutes on a 30-40% failure. That is the price of not paging on spikes, and it is why the 5-minute short window and the 14.4 factor are chosen the way they are. If ten minutes is too slow for an endpoint, the answer is a tighter SLO or a higher-traffic SLI, not a one-minute threshold."),
        p("Then the rule files change in one pull request: the old alert is deleted (keeping both means the noise stays), the burn-rate recording rules and alerts from lesson 11 are added, and each alert gets a runbook link. `promtool test rules` runs in CI with a synthetic outage and a synthetic spike, so a later edit that breaks either behaviour fails the build."),

        h2("5. Fix the replay tool"),
        p("The replay tool the team uses for backtests still implements the old rule. Its notification logic is fine; the rule it evaluates is not. Fix it to the policy above, and use the recorded weeks in the tests (spikes, an outage, a slow burn, low traffic at night) to check that it pages, tickets and stays quiet when it should."),

        challenge("chal_coding_otl_432"),

        h2("6. How to verify the new alert"),
        bullets([
            "**Backtest before shipping.** Replay at least four recent weeks: every known incident must page or ticket, and every page must be one the on-call engineer agrees was worth it.",
            "**Measure the alert, not just the service.** Track pages per week, the share of pages with an action in the log, and the time from the start of a known incident to the page. After the change, the first two should move a lot and the third only a little.",
            "**Inject a failure in staging.** A 30% failure with synthetic traffic above the minimum must page within about 15 minutes and resolve within about 5 minutes after you stop it; a single failed minute must not page.",
            "**Watch the ticket queue.** A ticket rule only works if someone reads the tickets. Put burn-3d tickets on the team board with an owner, or they are as silent as no alert at all.",
            "**Review after two weeks.** Read every page and ticket of the new policy at the next on-call handover, and keep the backtest script in the repository so the next change starts from data.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Tuning the threshold of an instant rule.** Any single-window threshold trades noise for blindness. Spot it: the threshold has been changed several times and the team still complains about both pages and missed incidents.",
            "**Using `for:` as the noise fix.** It hides spikes and delays every real page without catching slow burns. Spot it: `for: 5m` or longer on a page whose expression has a one-minute window.",
            "**Keeping the old alert \"just in case\".** Both rules fire, the noise stays, and nobody trusts either. Spot it: two alerts on the same endpoint and SLI with different windows and the same severity.",
            "**Paging on the slow rule.** A 1x burn over 3 days at 03:00 cannot be fixed faster than at 09:00. Spot it: night pages from burn-3d; make it a ticket.",
            "**Forgetting low traffic.** Without a minimum request count, a few failures at night still page. Spot it: pages at night where the windows hold a few dozen requests.",
        ]),

        h2("8. Summary"),
        numbered([
            "An alert is wrong when its pages need no action or real incidents do not page; a one-minute threshold was both, because it measured one minute instead of the error budget.",
            "Raising the threshold, adding for: or lengthening the single window each fixes one side and breaks the other; the multi-window, multi-burn-rate policy pages fast burns, tickets slow ones and needs a minimum of requests.",
            "Replay recorded weeks through the old and the new rule before shipping, delete the old alert, and measure the alert itself: pages per week, actions per page, time to page for real incidents.",
        ]),

        h2("Sources"),
        bullets([
            "Google SRE Workbook, chapter \"Alerting on SLOs\": the alerting attempts from a single threshold to multiwindow, multi-burn-rate alerts, and low-traffic services - sre.google/workbook/alerting-on-slos/",
            "Prometheus documentation: alerting rules (the for clause) and promtool test rules",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick another alert your team (or CodeDev) owns. Export a month of its firings and label each one \"action taken\" or \"no action\", list the incidents of that month that it did not catch, and write a one-page proposal: the SLI and SLO it should follow, the burn-rate rules, and the backtest you would run before switching."),
    ],
});
