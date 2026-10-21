// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-jsf-3-2",
    title: "Dates & time zones: UTC, Intl.DateTimeFormat & day boundaries",
    slug: { _type: "slug", current: "dates-time-zones-utc-intl-day-boundaries" },
    description:
        "A daily sales report puts a midnight flash sale in Hanoi on \"yesterday\". Learn what a JavaScript Date really stores, why toISOString() always answers in UTC, which strings parse as UTC and which as local time, and how to find the calendar day of an instant in any time zone with Intl.DateTimeFormat - including zones with daylight saving time.",
    estimatedTime: 20,

    scenario: {
        role: "Backend engineer, online shop based in Hanoi",
        problem:
            "The shop ran a midnight flash sale for 21 October, from 00:00 to 02:00 Hanoi time. The next morning the daily sales report says 21 October made 30% less than the payment provider's settlement for that day, while 20 October looks like the best Tuesday of the year. Marketing wants to know why the sale \"did not work\"; finance wants to know which number to send to the accountant. The report code has not changed in months, and every test order the team ever placed went through without a problem.",
    },

    content: [
        h2("1. The incident: a report that sells on the wrong day"),
        p("The report job loads the orders of the last few days and adds them up per day. Orders are stored with a `created_at` timestamp; the database driver hands them to JavaScript as `Date` objects:"),
        code("javascript", `
// daily-report.js
export function totalsPerDay(orders) {
    const totals = {};
    for (const order of orders) {
        const day = order.createdAt.toISOString().slice(0, 10); // "2026-10-21"
        totals[day] = (totals[day] ?? 0) + order.amount;
    }
    return totals;
}`, "daily-report.js"),
        p("It looks harmless: `toISOString()` gives `\"2026-10-21T...\"`, and the first ten characters are the date. The team tested it with orders placed during office hours, and those always landed on the right day. The flash sale was the first time a large share of the day's orders was placed **between midnight and 07:00** in Hanoi."),

        h2("2. Reproduce it in three lines"),
        p("Take one flash-sale order, placed at 06:30 on 21 October in Hanoi. Hanoi is 7 hours ahead of UTC, so the same moment is 23:30 on 20 October in UTC:"),
        code("javascript", `
const placed = new Date("2026-10-21T06:30:00+07:00"); // 06:30 in Hanoi

placed.toISOString();              // "2026-10-20T23:30:00.000Z"
placed.toISOString().slice(0, 10); // "2026-10-20"  <- the report's "day"`, "repro.js"),
        p("Every order placed between 00:00 and 06:59 Hanoi time is counted on the previous day. The whole flash sale moved to 20 October, which is why one day looks too small and the day before looks too big. Before reading on, test your intuition: does running the job on a server set to Hanoi time change anything?"),
        challenge("chal_quiz_jsf_321"),

        h2("3. A Date is an instant, not a day"),
        p("A `Date` stores exactly one number: the milliseconds since 1 January 1970 00:00:00 UTC (the **epoch**). It has no time zone and no calendar day of its own. \"06:30 on 21 Oct in Hanoi\", \"23:30 on 20 Oct in UTC\" and \"19:30 on 20 Oct in New York\" are three ways to write the same number:"),
        code("javascript", `
const a = new Date("2026-10-21T06:30:00+07:00");
const b = new Date("2026-10-20T23:30:00Z");
const c = new Date("2026-10-20T19:30:00-04:00");

a.getTime(); // 1792539000000
a.getTime() === b.getTime() && b.getTime() === c.getTime(); // true`),
        image("one-instant-three-days", {
            alt: "Three horizontal rows - UTC, Hanoi and New York - share one UTC timeline from 20 Oct 00:00Z to 22 Oct 00:00Z. Each row is split into its own calendar days. A red vertical line marks the order at 2026-10-20T23:30Z: it falls on 20 Oct in UTC (23:30), on 21 Oct in Hanoi (06:30) and on 20 Oct in New York (19:30). The first seven hours of 21 Oct in Hanoi are highlighted because UTC still calls them 20 Oct.",
            caption: "The same instant belongs to different calendar days. A Hanoi day runs from 17:00 UTC to 17:00 UTC the next day.",
        }),
        p("A **calendar day** only exists once you pick a time zone. \"Which day was this order placed?\" is really \"which day was it on the wall clocks in Hanoi?\". The bug in the report is that it never asked Hanoi - `toISOString()` always answers for UTC."),

        h2("4. The traps in the Date API"),
        p("Most date bugs come from methods that quietly pick a time zone for you. Some use **UTC**, some use the **local zone of the machine** running the code - your laptop, the CI runner, the production container - and those can all differ."),
        h3("Parsing strings"),
        bullets([
            "`new Date(\"2026-10-21T06:30:00Z\")` and `new Date(\"2026-10-21T06:30:00+07:00\")`: the string names its offset, so the instant is the same on every machine. Store and exchange dates in this form.",
            "`new Date(\"2026-10-21\")`: a **date-only** ISO string is read as **midnight UTC**. In New York that instant is still 20 October, 20:00.",
            "`new Date(\"2026-10-21T00:00\")`: a date-time **without** `Z` or an offset is read in the **machine's local zone**. The same line gives `2026-10-20T17:00:00.000Z` in Hanoi and `2026-10-21T07:00:00.000Z` in Los Angeles.",
            "Anything else (`\"21/10/2026\"`, `\"Oct 21 2026\"`) is implementation-defined. An unparseable string gives an **Invalid Date**: `getTime()` returns `NaN` and `toISOString()` throws a `RangeError`.",
        ]),
        h3("Building and reading parts"),
        bullets([
            "Months count from **0**: `new Date(2026, 9, 21)` is 21 October, `new Date(2026, 10, 21)` is 21 **November**, and `getMonth()` returns `9` for October. Days of the month count from 1.",
            "`new Date(y, m, d)`, `getFullYear()`, `getMonth()`, `getDate()`, `getHours()` and `toString()` use the **machine's local zone**.",
            "`Date.UTC(y, m, d)`, the `getUTC...()` methods and `toISOString()` use **UTC** - always, wherever the code runs. `JSON.stringify` calls `toISOString()`, so dates in JSON are UTC too.",
            "Neither of them answers for \"Hanoi\" or \"New York\" when the machine is somewhere else. For a specific zone you need `Intl`.",
        ]),
        callout("warning", "Your laptop is not production",
            "A developer in Hanoi runs the code with a +07:00 local zone; the container in the cloud usually runs in UTC; a teammate in Berlin has +01:00 or +02:00 depending on the season. Code that uses local getters gives three different answers for the same order. In tests, never depend on the machine's zone or on the current time: use fixed instants with Z or an offset, and pass the time zone explicitly."),

        h2("5. Intl.DateTimeFormat: ask a specific time zone"),
        p("`Intl.DateTimeFormat` is built into every modern browser and into Node 24 (with full time zone data). It converts an instant into the wall-clock date and time of any **IANA time zone** - names like `Asia/Ho_Chi_Minh`, `America/New_York`, `Europe/Berlin` or `UTC`. For display, choose a locale and a style:"),
        code("javascript", `
const placed = new Date("2026-10-20T23:30:00Z");

new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short",
}).format(placed);   // "06:30 21 thg 10, 2026"

new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "medium", timeStyle: "long",
}).format(placed);   // "Oct 20, 2026, 7:30:00 PM EDT"`, "display.js"),
        p("Formatted strings are for people. Their exact text depends on the locale and on the ICU version, so never slice, parse or compare them in code. When the code needs the numbers, use `formatToParts()`: it returns the same result as an array of typed pieces."),
        code("javascript", `
const dayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
});

dayParts.formatToParts(placed);
// [
//   { type: "month",   value: "10" },
//   { type: "literal", value: "/" },
//   { type: "day",     value: "21" },
//   { type: "literal", value: "/" },
//   { type: "year",    value: "2026" },
// ]`, "parts.js"),
        p("The order of the pieces follows the locale (`en-US` puts the month first), so read them by `type`, not by position. The month here is already 1-based and zero-padded - `\"10\"` for October - because it is the month a person in Hanoi would write down."),

        h3("Zones with and without daylight saving time"),
        p("`Asia/Ho_Chi_Minh` is UTC+7 all year, so a Hanoi day always runs from 17:00 UTC to 17:00 UTC. Many zones are not that simple. `America/New_York` is UTC-4 in summer (EDT) and UTC-5 in winter (EST); in 2026 it moves its clocks on **8 March** and **1 November**. Look at what that does to 1 November:"),
        code("javascript", `
const ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeStyle: "long" });

ny.format(new Date("2026-11-01T05:30:00Z")); // "1:30:00 AM EDT"
ny.format(new Date("2026-11-01T06:30:00Z")); // "1:30:00 AM EST"  - the same wall-clock time, an hour later

// 1 November 2026 lasts 25 hours in New York; 8 March 2026 lasted 23.`, "dst.js"),
        p("So the offset of a zone is not a constant you can store next to its name. It depends on the instant, and governments change the rules from time to time. `Intl` ships the rules (the IANA time zone database) and applies the right offset for every instant; your code should only pass the zone **name**."),

        h2("6. Build it: totals per calendar day, in any zone"),
        p("Now write the function the report should have used. It receives orders whose `createdAt` is an ISO string with `Z` or an offset, plus the name of the time zone the business reports in, and returns the totals per calendar day of that zone. The tests run the same orders in Hanoi, UTC and New York - including the night New York leaves daylight saving time - so the solution cannot depend on the machine it runs on."),
        bullets([
            "Create the formatter **once**, outside the loop - building `Intl` objects is far slower than calling them.",
            "Turn each `createdAt` into a `Date`, ask the formatter for its parts, and build the `YYYY-MM-DD` key from the `year`, `month` and `day` parts.",
            "Amounts are integers (VND, or cents), so adding them with `+` is exact.",
        ]),
        challenge("chal_coding_jsf_322", "Build one formatter with the timeZone option and 2-digit month and day. For each order, read the year, month and day parts by their type (not by position) and join them with dashes."),

        h2("7. Shipping the fix"),
        p("Replacing `toISOString().slice(0, 10)` is half of the fix. The other half is making the time zone a deliberate, visible choice everywhere the report touches dates:"),
        numbered([
            "**Store instants in UTC.** Keep `created_at` as an instant (`timestamptz` in Postgres, an ISO string with `Z` in JSON). Never store a \"local\" timestamp without its zone - you cannot recover the instant later.",
            "**Name the business time zone once.** The report is a Hanoi report, so `REPORT_TIME_ZONE = \"Asia/Ho_Chi_Minh\"` lives in configuration and is passed to every function that turns instants into days. A second market gets its own zone, not a new offset.",
            "**Ask the database in the same zone.** If the grouping moves into SQL, Postgres does the same conversion: `(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`. To fetch one Hanoi day, use the half-open range `created_at >= '2026-10-21T00:00:00+07:00' AND created_at < '2026-10-22T00:00:00+07:00'` - that is 17:00 UTC to 17:00 UTC.",
            "**Display in the viewer's zone.** The order page shows `createdAt` with `Intl.DateTimeFormat` and the customer's or the shop's zone, never the server's.",
            "**Re-run the damaged reports.** The bug affected every day, not just the sale: rebuild the stored daily totals for the whole period and tell finance which numbers changed.",
            "**Pin it with tests.** Add orders at 16:59:59Z, 17:00:00Z and 23:59:00Z - the edges of a Hanoi day - and run the suite in CI with a different `TZ` than the developers' laptops.",
        ]),
        callout("info", "Temporal is coming",
            "Temporal is the new date and time API for JavaScript, with separate types for an instant (Temporal.Instant), a date in a time zone (Temporal.ZonedDateTime) and a calendar date without a time (Temporal.PlainDate). It removes most of the traps in this lesson, but it is not available by default in Node 24 (typeof Temporal is \"undefined\"). Until your runtimes ship it, Date plus Intl.DateTimeFormat with an explicit timeZone is the dependable choice; a polyfill is an option if you want the new API today."),

        h2("8. Pitfalls"),
        bullets([
            "**\"Our zone has no DST, so +7 hours is fine.\"** It works for Hanoi today, and breaks the day the same code serves another market or a zone changes its rules. Pass the IANA name and let `Intl` apply the offset.",
            "**\"A day is 24 hours.\"** Not in zones with DST: adding `24 * 60 * 60 * 1000` to midnight in New York lands on 23:00 or 01:00 twice a year. Step through days by calendar date, not by milliseconds.",
            "**`toLocaleDateString()` without a `timeZone` option** formats in the server's zone. Always pass `timeZone` on the server.",
            "**Made-up zone names throw.** `Asia/Hanoi` is not an IANA zone: `new Intl.DateTimeFormat(\"en-US\", { timeZone: \"Asia/Hanoi\" })` throws a `RangeError`. Validate configured zones at startup. Some runtimes also report `Asia/Ho_Chi_Minh` back as its older alias `Asia/Saigon` in `resolvedOptions()`, so do not compare zone names as strings.",
            "**Building strings without an offset**, such as `` `${day}T00:00` ``, silently means \"midnight on this machine\". Write the offset (`+07:00`) or `Z` explicitly.",
            "**Comparing formatted strings in tests.** Locale data changes between versions; compare instants (`getTime()`) or the parts you computed.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Instants are stored and exchanged in UTC: `timestamptz` in the database, ISO strings with `Z` or an offset in JSON and APIs.",
            "Every conversion from an instant to a calendar day or a wall-clock time names its IANA time zone explicitly (`Intl.DateTimeFormat` with `timeZone`).",
            "No `toISOString().slice(0, 10)`, `getDate()` or `toLocaleDateString()` without `timeZone` where a business day is meant.",
            "No hard-coded UTC offsets; zones with daylight saving time are handled by `Intl`, not by arithmetic.",
            "Date-only strings are known to be UTC midnight, and date-times without an offset are never parsed on the server.",
            "Month numbers from `getMonth()` / `new Date(y, m, d)` are treated as zero-based.",
            "Tests use fixed instants around day boundaries and DST changes, and pass whatever `TZ` the machine has.",
        ]),
    ],
});
