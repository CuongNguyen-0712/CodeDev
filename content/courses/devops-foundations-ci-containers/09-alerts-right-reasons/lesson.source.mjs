// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-devf-4-2",
    title: "Alerts that wake you for the right reasons",
    slug: { _type: "slug", current: "devops-alerts-symptoms-for-hysteresis-burn-rate" },
    description:
        "One night the Rice Rocket on-call engineer was paged 38 times by a CPU alert that flapped around 80%, muted the channel, and slept through the real outage: checkout failed for 25 minutes, but the only error alert averaged all routes together and never crossed its threshold. Learn to alert on symptoms users feel, write Prometheus alerting rules with for, labels, annotations and runbooks, stop flapping with a pending period and a recovery threshold, keep a failing route from being averaged away, page on error-budget burn rate, and use Alertmanager grouping, inhibition and silences.",
    estimatedTime: 22,

    scenario: {
        role: "Junior DevOps engineer on the on-call rotation at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Between 00:40 and 04:10 the on-call phone rang 38 times for HighCPU on api-3: CPU hovered around 80%, and the alert fired every time it crossed the line and resolved every time it dipped. At 01:15 the on-call muted the alert channel. From 02:50 to 03:15 one in four checkouts returned HTTP 500, customers could not pay, and nobody was paged: the error alert divided all 5xx responses by all requests across every route, so a busy, healthy menu page hid a failing checkout. The team found out from angry restaurant owners the next morning.",
    },

    content: [
        h2("1. The incident"),
        p("Rice Rocket had two alerts that paged the on-call engineer. Both looked reasonable when someone wrote them:"),
        code("yaml", `
groups:
  - name: api
    rules:
      - alert: HighCPU
        expr: 100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100 > 80
        labels:
          severity: page

      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        labels:
          severity: page`, "alerts.yml"),
        p("On the night of the incident, both of them failed - in opposite directions:"),
        bullets([
            "**HighCPU paged far too often.** CPU on `api-3` hovered between 77% and 85% for hours. The rule has no `for:`, so every evaluation above 80% fired it, and the first one at or below 80% resolved it. 38 pages in one night, none of which needed a human: the service was answering every request in time.",
            "**The on-call stopped listening.** At 01:15 they muted the alert channel to get some sleep. This is not a personal failure - it is the predictable result of an alert that cries wolf. The name for it is **alert fatigue**.",
            "**HighErrorRate never fired.** From 02:50 to 03:15 a quarter of all checkouts failed. But the expression divides *all* 5xx responses by *all* requests, and the menu page - the busiest route by far - was fine. The overall ratio stayed under 2%, far below the 5% threshold. 25 minutes of lost orders, zero pages.",
        ]),
        p("The fix is not \"tune the numbers\". It is to page on the right *things*, and to describe *when* a condition is real in a way that ignores noise."),

        h2("2. Reproduce it"),
        p("Here is 30 minutes of the CPU series from that night, one value per minute, replayed through the same logic the HighCPU rule used: fire when the value goes above 80, resolve when it is not above 80. Save it as `replay.py` and run `python replay.py`:"),
        code("python", `
night = [76, 81, 79, 83, 78, 82, 77, 84, 80, 81, 79, 85, 87, 89, 92,
         90, 88, 86, 83, 79, 82, 78, 74, 71, 69, 67, 72, 66, 64, 63]   # CPU %, from 02:00

firing = False
pages = []
for minute, cpu in enumerate(night):
    if cpu > 80 and not firing:
        firing = True
        pages.append(f"02:{minute:02d}")       # a new page every time it fires
    elif cpu <= 80:
        firing = False                         # one dip resolves it
print(len(pages), "pages:", ", ".join(pages))

# Output:
# 7 pages: 02:01, 02:03, 02:05, 02:07, 02:09, 02:11, 02:20`, "replay.py"),
        p("Seven pages in half an hour, for a server that was busy but healthy. Now the error alert, with request counts from a 5-minute window during the checkout outage:"),
        code("python", `
window = {"/menu": (12000, 12), "/search": (3000, 9), "/checkout": (1000, 240)}   # (requests, 5xx)

requests = sum(r for r, _ in window.values())
errors = sum(e for _, e in window.values())
print(f"all routes  {errors:>4} / {requests:>5} = {errors / requests:.1%}")
for route, (r, e) in window.items():
    print(f"{route:<11} {e:>4} / {r:>5} = {e / r:.1%}")

# Output:
# all routes   261 / 16000 = 1.6%
# /menu         12 / 12000 = 0.1%
# /search        9 /  3000 = 0.3%
# /checkout    240 /  1000 = 24.0%`, "ratio.py"),
        p("The alert saw the first line: 1.6%, nothing to worry about. Customers saw the last line: almost one checkout in four failing."),

        h2("3. Page on symptoms, not causes"),
        p("A **symptom** is something users feel: requests failing, pages slow, orders not arriving. A **cause** is something inside the system that *might* lead to a symptom: high CPU, a full queue, a restarted pod, low memory. High CPU on a server that answers every request in 80 ms is not a problem - it may just mean the server is well used."),
        p("The numbers that describe what users feel are called **SLIs** (service level indicators). The classic starting set is the **four golden signals** from Google's SRE book:"),
        bullets([
            "**Latency**: how long requests take - as percentiles, not averages (the previous lesson).",
            "**Errors**: the share of requests that fail (5xx, timeouts, wrong answers).",
            "**Traffic**: how much demand there is (requests per second, orders per minute). A sudden drop to zero is often the loudest symptom of all.",
            "**Saturation**: how full the system is (CPU, memory, connection pools, queue length). This is the cause-side signal: watch it on dashboards, alert on it only when it predicts a symptom soon (a disk filling up).",
        ]),
        h3("Page, ticket or dashboard"),
        p("Before an alert is allowed to wake someone up, it has to pass three questions:"),
        numbered([
            "**Is it urgent?** Will users be hurt in the next minutes or hours if nobody acts now?",
            "**Is it actionable?** Can the on-call engineer do something about it - and does the alert say what?",
            "**Is it real?** Does it fire only when the problem is real, not on every short spike?",
        ]),
        p("Three yes answers make a **page** (phone call, any hour). Real but not urgent - a disk that will be full in four days, a certificate that expires in two weeks - makes a **ticket** for working hours. Everything else belongs on a **dashboard**, where someone can look when they are investigating. Encode the decision in a label, so routing can use it:"),
        code("yaml", `
labels:
  severity: page      # wakes someone up
# or
labels:
  severity: ticket    # creates a task for working hours`),
        callout("info", "Causes still matter",
            "Moving the CPU alert off the pager does not mean deleting it. Keep CPU, memory and queue length on the service dashboard. When a symptom alert fires, those graphs are the first place you look for the cause."),

        h2("4. A Prometheus alerting rule, field by field"),
        p("Prometheus evaluates every rule on a fixed schedule (`evaluation_interval`, 1 minute by default). Here is the checkout error alert rewritten properly:"),
        code("yaml", `
groups:
  - name: checkout
    rules:
      - alert: CheckoutHighErrorRatio
        expr: |
          sum by (route) (rate(http_requests_total{job="checkout", code=~"5.."}[5m]))
            /
          sum by (route) (rate(http_requests_total{job="checkout"}[5m]))
            > 0.02
        for: 5m
        keep_firing_for: 10m
        labels:
          severity: page
          team: payments
        annotations:
          summary: "Checkout {{ $labels.route }}: {{ $value | humanizePercentage }} of requests fail"
          runbook_url: "https://runbooks.ricerocket.example/checkout-5xx"`, "alerts.yml"),
        bullets([
            "**`expr`** is a PromQL query. Every series it returns is one alert instance; when it returns nothing, there is no alert. `> 0.02` filters the series down to the ones above 2%.",
            "**`for: 5m`** - the condition must stay true for 5 minutes before the alert fires. Until then it is **pending**. If the expression stops returning the series at any evaluation in between, the pending alert is dropped and the clock starts again next time.",
            "**`keep_firing_for: 10m`** (Prometheus 2.42 and later) keeps a firing alert firing for 10 more minutes after the condition clears, so a short dip does not resolve it and fire it again a minute later.",
            "**`labels`** are added to the alert. `severity` and `team` decide where the notification goes (section 8).",
            "**`annotations`** are the human text. `{{ $labels.route }}` and `{{ $value }}` are filled in per alert; `humanizePercentage` turns `0.24` into `24%`. Always include a `runbook_url`.",
        ]),
        h3("inactive, pending, firing, resolved"),
        p("Every alert instance moves through the same states. You can see them on the Prometheus **Alerts** page and query them as the `ALERTS` series (`ALERTS{alertname=\"CheckoutHighErrorRatio\", alertstate=\"pending\"}`):"),
        code("text", `
inactive --condition true--> pending --true for the whole for: duration--> firing
                                |                                             |
                     condition false: dropped                  condition false (after keep_firing_for)
                                v                                             v
                            inactive                              resolved -> inactive`),
        p("Prometheus sends firing alerts to **Alertmanager** on every evaluation while they fire, and sends one more notification when they resolve. Alertmanager - not Prometheus - decides who gets paged."),

        h2("5. Flapping: for: and a recovery threshold"),
        p("An alert **flaps** when it fires and resolves again and again because the value hovers around the threshold. Two tools stop it, and they fix two different halves of the problem:"),
        bullets([
            "**A pending period (`for:`)** fixes the *firing* side: a spike shorter than the period never fires. Short spikes are normal for a busy service; a problem that lasts 5 minutes is real.",
            "**A recovery threshold** fixes the *resolving* side: once firing, the alert resolves only when the value drops clearly below the threshold - say under 70% for a rule that fires above 80%. A value of 79% while the alert fires means \"still bad\", not \"fixed\". This is called **hysteresis**: the line to turn on is higher than the line to turn off. Monitoring tools such as Datadog and Grafana call it a recovery threshold; in Prometheus, `keep_firing_for` gives a similar effect with time instead of a second value.",
        ]),
        image("flapping-vs-for-hysteresis", {
            alt: "Two charts of the same CPU series for api-3 from 02:00 to 02:29, one point per minute, with a red threshold line at 80 percent. Top chart, red, no for and resolve as soon as CPU is not above 80 percent: the line zigzags across 80 percent and seven page markers appear, at 02:01, 02:03, 02:05, 02:07, 02:09, 02:11 and 02:20; the summary says 7 pages in 30 minutes, 38 over the night. Bottom chart, green, for 5 minutes and resolve only below 70 percent: every short crossing becomes a one-minute amber pending band that is dropped, a long amber pending band runs from 02:11 to 02:15, the alert fires at 02:16 with one page marker, a red firing band lasts while CPU falls through 79 and 74 percent, and a green resolved marker appears at 02:24 when CPU drops below the dashed 70 percent line; the summary says 1 page, fired 02:16, resolved 02:24.",
            caption: "Same data, same 80% threshold. A pending period ignores short spikes; a recovery threshold keeps one real problem from turning into many pages.",
        }),
        p("Notice what changed and what did not. The fixed rule still pages - at 02:16, after CPU had been above 80% for five full minutes - so a real, lasting problem is never hidden. It just pages **once** for it."),
        callout("warning", "for: delays every page, real ones too",
            "A 5 minute pending period means a real outage pages 5 minutes later. Pick the duration per alert: a few minutes for user-facing errors, longer for slow-moving signals like disk space. Never use for: to hide an alert that is simply wrong - delete or rewrite that one."),

        h2("6. Do not average the outage away"),
        p("The second half of the incident was a math problem. `sum(errors) / sum(requests)` across all routes is a **traffic-weighted** ratio: big healthy routes outvote small broken ones. Checkout is a small share of Rice Rocket's requests and nearly all of its revenue."),
        bullets([
            "**Keep the dimension that matters.** `sum by (route) (...) / sum by (route) (...)` keeps one ratio per route, so `/checkout` at 24% is its own alert instance - and the `{{ $labels.route }}` annotation says which route is broken.",
            "**Or give important flows their own alert.** A dedicated `CheckoutHighErrorRatio` with its own threshold says plainly what the business cares about.",
            "**Do not average ratios either.** Averaging per-route percentages gives a route with 10 requests the same weight as one with 10 000 - it overreacts to tiny routes instead of underreacting.",
            "**Watch for tiny traffic.** At 3am a route with 4 requests and 1 error has a 25% error ratio. Add a minimum volume to the rule, for example `and sum by (route) (rate(http_requests_total[5m])) > 0.5` (more than about 30 requests a minute), or use the burn-rate alerts below, which look at longer windows.",
        ]),

        h2("7. SLOs, error budgets and burn rate"),
        p("A fixed threshold like \"2% errors\" still leaves a question open: how bad is bad enough to wake someone up? **Service level objectives** answer it with a number the business agreed on."),
        bullets([
            "**SLO**: a target for an SLI over a period. Rice Rocket: \"99.9% of checkout requests succeed, measured over 30 days\".",
            "**Error budget**: what the SLO allows to fail - 0.1% of requests. If checkout were completely down, the budget would cover 0.1% of 30 days: 43.2 minutes.",
            "**Burn rate**: how fast you are spending the budget, compared with spending it evenly. Error ratio divided by budget: an error ratio of 0.1% is burn rate 1 (the budget lasts exactly 30 days); 1.44% is burn rate 14.4.",
        ]),
        p("Burn rate turns \"is this bad?\" into arithmetic. At burn rate 14.4, one hour uses 14.4 / 720 hours = **2% of the whole month's budget**, and the budget is gone in about two days. That is worth a page. Burn rate 1.2 for a few hours is worth a ticket at most."),
        h3("Two windows: fast to fire, fast to reset"),
        p("A long window (1 hour) proves the problem is big enough to matter; a short window (5 minutes) proves it is *still happening*, so the alert resolves soon after a fix. The rule fires only when both agree. The Google SRE workbook suggests these starting points for a 99.9% SLO over 30 days:"),
        code("text", `
severity   burn rate   long window   short window   budget used before it fires
page       14.4        1h            5m             2%
page       6           6h            30m            5%
ticket     1           3d            6h             10%`),
        code("yaml", `
- alert: CheckoutErrorBudgetBurn
  expr: |
    (
      sum(rate(http_requests_total{job="checkout", code=~"5.."}[1h]))
        / sum(rate(http_requests_total{job="checkout"}[1h]))
    ) > (14.4 * 0.001)
    and
    (
      sum(rate(http_requests_total{job="checkout", code=~"5.."}[5m]))
        / sum(rate(http_requests_total{job="checkout"}[5m]))
    ) > (14.4 * 0.001)
  labels:
    severity: page
  annotations:
    summary: "Checkout is burning its 30-day error budget 14.4x too fast"
    runbook_url: "https://runbooks.ricerocket.example/checkout-error-budget"`, "slo-alerts.yml"),
        p("On the night of the incident checkout ran at a 24% error ratio - burn rate 240. This rule would have paged within the first few minutes, and it would never have paged for CPU at all, because CPU is not part of the SLO."),

        h2("8. Alertmanager: grouping, inhibition, silences"),
        p("Prometheus decides *whether* an alert fires. Alertmanager decides *who hears about it, how often, and together with what*:"),
        code("yaml", `
route:
  receiver: team-slack                     # default: a chat channel
  group_by: [alertname, route]
  group_wait: 30s                          # wait for related alerts before the first notification
  group_interval: 5m                       # batch new alerts into an existing group
  repeat_interval: 4h                      # remind if still firing
  routes:
    - matchers: [severity="page"]
      receiver: oncall-phone
    - matchers: [severity="ticket"]
      receiver: ticket-queue

inhibit_rules:
  - source_matchers: [alertname="CheckoutDown"]
    target_matchers: [alertname="CheckoutHighErrorRatio"]
    equal: [route]`, "alertmanager.yml"),
        bullets([
            "**Grouping** turns 40 alerts from 40 pods with the same problem into one notification that lists them all.",
            "**Inhibition** mutes an alert while a bigger one that explains it is firing: when checkout is completely down, the error-ratio alert for the same route adds nothing.",
            "**Silences** mute matching alerts for a fixed time, for planned work or a known issue: `amtool silence add alertname=HighCPU instance=api-3:9100 --duration=2h --comment=\"resize api-3, ticket OPS-412\" --alertmanager.url=http://localhost:9093`. A silence expires on its own - unlike muting a whole channel, which is what happened at 01:15.",
        ]),

        h2("9. Runbooks and the alert review"),
        p("Every paging alert links to a **runbook**: a short page that a tired person can follow at 3am. It answers four questions:"),
        numbered([
            "**What does this alert mean** for users, in one sentence?",
            "**How do I confirm it** - which dashboard, which query, which log search?",
            "**What do I do first** to stop the damage - roll back, scale up, fail over, switch off a feature flag?",
            "**Who do I call** if that does not work?",
        ]),
        p("Alerts rot. Once a month, look at every page from the past weeks and ask of each one: *was it real, was it urgent, did someone act on it?* An alert that is never acted on gets rewritten, turned into a ticket, or deleted. Count pages per on-call shift; Google's SRE book suggests no more than about two incidents per 12-hour shift, so people have time to handle each one properly."),
        callout("tip", "Replay before you ship",
            "Before you change a rule, replay last week's data through it: how many pages would it have sent, and would it have caught the incidents you know about? That is exactly what the tool in the next exercise does."),

        h2("10. Your turn"),
        p("First, decide which alerts deserve a page and work out what an error-ratio expression really returns:"),
        challenge("chal_quiz_devf_421"),
        p("Next, the on-call review uses a small replay tool, `evaluate(rule, series)`, to test alert rules against recorded data before they go live. It has the same two bugs as the night of the incident: a pending alert is never dropped when the value dips, so separate short spikes add up and fire, and a firing alert resolves the moment the value is not above the threshold, so a hovering metric pages again and again. The docstring in the file has the exact rules."),
        challenge("chal_fix_devf_422", "Keep the existing loop. A pending alert needs to forget its start minute on any minute where the condition is false, and a firing alert should look at clear_below, not at threshold, to decide that it has recovered. Check the boundaries in the docstring: exactly at the threshold is not above it, and exactly at clear_below is not below it."),

        h2("11. Pitfalls"),
        bullets([
            "**Paging on causes** (CPU, memory, a pod restart) instead of symptoms users feel. Keep causes on dashboards.",
            "**No `for:`** on a noisy metric: every short spike pages.",
            "**Resolving at the firing threshold**: a value that hovers around the line fires and resolves all night. Use a recovery threshold or `keep_firing_for`.",
            "**`sum(errors) / sum(requests)` across everything**: busy healthy routes hide a failing small one. Keep `by (route)` or alert per critical flow.",
            "**Ratios on tiny traffic**: one error in four requests is 25%. Require a minimum request rate or use long-window burn rates.",
            "**Alerts without a runbook or owner**: the person paged at 3am has to guess what to do.",
            "**Muting a channel instead of fixing the rule**: real pages get muted too. Use a silence with an end time, then fix or delete the noisy alert.",
        ]),

        h2("12. Checklist"),
        bullets([
            "Every paging alert describes a symptom users feel, is urgent and has a clear first action.",
            "Real-but-not-urgent alerts are tickets (`severity: ticket`); causes live on dashboards.",
            "Noisy conditions have a `for:` duration and a recovery threshold or `keep_firing_for`.",
            "Error ratios keep the dimension that matters (`by (route)`, per critical flow) and ignore tiny traffic.",
            "Important services have an SLO, and pages come from fast error-budget burn checked over a long and a short window.",
            "Alertmanager groups related alerts, inhibits redundant ones, and silences expire on their own.",
            "Every alert has `summary` and `runbook_url` annotations, and the team reviews pages regularly.",
        ]),
    ],
});
