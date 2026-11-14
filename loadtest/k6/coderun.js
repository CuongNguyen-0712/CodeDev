// Code-runner capacity: only the coder journey, driven by an arrival rate that rises 1 run/s every 2 minutes.
import { sessions } from "./lib/config.js";
import { buildData, clientFor, ctxOf, sessionOfVu } from "./setup.js";
import coder from "./journeys/coder.js";

const maxRate = Number(__ENV.MAX_RATE) || 10;
const stages = [];
for (let r = 1; r <= maxRate; r++) stages.push({ duration: "5s", target: r }, { duration: "115s", target: r });

export const options = {
    scenarios: {
        coderun: {
            executor: "ramping-arrival-rate",
            startRate: 1,
            timeUnit: "1s",
            stages,
            preAllocatedVUs: Math.min(sessions.length, Math.max(2, maxRate * 4)),
            maxVUs: sessions.length, // one session per VU
            gracefulStop: "7m", // a run may take up to 6 minutes to finish
        },
    },
    thresholds: { failed_requests: [{ threshold: "rate<0.2", abortOnFail: true, delayAbortEval: "2m" }] },
    summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function setup() {
    return buildData();
}

export default function (data) {
    const client = clientFor("auth");
    client.journey = "coder";
    coder(client, ctxOf(data), sessionOfVu());
}
