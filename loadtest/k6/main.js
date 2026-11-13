import { PROFILE, N, sessions } from "./lib/config.js";
import { STAGE_MS, STAGE_VUS, WEIGHTS, pickJourney } from "./lib/pure.js";
import { buildData, clientFor, ctxOf, sessionOfVu } from "./setup.js";
import coder from "./journeys/coder.js";
import guest from "./journeys/guest.js";
import learner from "./journeys/learner.js";
import social from "./journeys/social.js";

const journeys = { guest, learner, social, coder };

// Every VU owns one minted session, so no profile may peak above the number of sessions.
function within(peak) {
    if (peak > sessions.length) throw new Error(`profile ${PROFILE} peaks at ${peak} VUs but only ${sessions.length} sessions are minted`);
    return peak;
}

const stageSec = STAGE_MS / 1000;
function stressStages() {
    const max = within(Number(__ENV.MAX_VUS) || 3000);
    const stages = [];
    // Each step is one STAGE_MS window (10 s ramp + hold) so the `stage` tag lines up with the steps.
    for (let v = STAGE_VUS; v < max + STAGE_VUS; v += STAGE_VUS) {
        const target = Math.min(v, max);
        stages.push({ duration: "10s", target }, { duration: `${stageSec - 10}s`, target });
        if (target === max) break;
    }
    return stages;
}

// Built lazily: only the chosen profile is checked against the number of minted sessions.
const scenarios = {
    smoke: () => ({ executor: "constant-vus", vus: within(5), duration: "1m" }),
    stress: () => ({ executor: "ramping-vus", startVUs: 0, stages: stressStages(), gracefulRampDown: "30s" }),
    soak: () => ({ executor: "constant-vus", vus: within(Math.round(0.7 * N)), duration: "30m" }),
    spike: () => ({
        executor: "ramping-vus", startVUs: 0, gracefulRampDown: "30s",
        stages: [{ duration: "30s", target: within(2 * N) }, { duration: "2m", target: 2 * N }, { duration: "30s", target: 0 }],
    }),
};
if (!scenarios[PROFILE]) throw new Error(`unknown PROFILE ${PROFILE}: use smoke, stress, soak or spike`);

export const options = {
    scenarios: { [PROFILE]: scenarios[PROFILE]() },
    thresholds: { failed_requests: [{ threshold: "rate<0.2", abortOnFail: true, delayAbortEval: "2m" }] },
    summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function setup() {
    return buildData();
}

export default function (data) {
    const name = pickJourney(Math.random(), WEIGHTS);
    const client = clientFor(name === "guest" ? "guest" : "auth");
    client.journey = name;
    journeys[name](client, ctxOf(data), sessionOfVu());
    client.think();
}
