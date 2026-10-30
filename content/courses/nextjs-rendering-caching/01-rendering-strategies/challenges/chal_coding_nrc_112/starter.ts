import { readFileSync } from "node:fs";

// CodeDev rendering plan: one line per route, from the page's traits.
//
// Page (read from the team's routes config, so "changes" may hold anything):
//   route                 the URL pattern, e.g. "/courses"
//   readsRequestData      true when the page reads cookies, headers or searchParams
//   personalized          true when the HTML differs per signed-in learner
//   changes               "never" | "on-publish" | "hourly" | "every-request"
//   toleratesStaleSeconds how many seconds old the page may be for a visitor
//
// chooseRendering(page) returns { strategy, revalidateSeconds? }. Checks in this order, first match wins:
//   1. changes is not one of the four values -> throw new Error(`unknown changes value "<changes>"`)
//   2. toleratesStaleSeconds is not a whole number >= 0 -> throw new Error(`invalid toleratesStaleSeconds <value>`)
//   3. readsRequestData or personalized       -> { strategy: "dynamic" }
//   4. changes is "every-request"             -> { strategy: "dynamic" }
//   5. changes is "never"                     -> { strategy: "static" }
//   6. toleratesStaleSeconds is 0             -> { strategy: "dynamic" }
//   7. otherwise                              -> { strategy: "isr", revalidateSeconds: toleratesStaleSeconds }
// Only "isr" has revalidateSeconds; "static" and "dynamic" must not set it.
// Do not change the types or the test runner.

type Strategy = "static" | "isr" | "dynamic";

interface Page {
    route: string;
    readsRequestData: boolean;
    personalized: boolean;
    changes: string;
    toleratesStaleSeconds: number;
}

interface Decision {
    strategy: Strategy;
    revalidateSeconds?: number;
}

const CHANGES = ["never", "on-publish", "hourly", "every-request"];

function chooseRendering(page: Page): Decision {
    // TODO: apply the checks in the order listed above
    return { strategy: "static" };
}

// ---------------------------------------------------------------- test runner (do not change)
const pages: Page[] = JSON.parse(readFileSync(0, "utf8"));
for (const page of pages) {
    try {
        const d = chooseRendering(page);
        const revalidate = d.revalidateSeconds === undefined ? "" : ` revalidate=${d.revalidateSeconds}`;
        console.log(`${page.route} -> ${d.strategy}${revalidate}`);
    } catch (e) {
        console.log(`${page.route} -> error: ${(e as Error).message}`);
    }
}
