import { sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { json, pick } from "./util.js";

const coderunTotal = new Trend("coderun_total_ms", true);
const coderunStuck = new Counter("coderun_stuck");

const MAX_WAIT_MS = 6 * 60 * 1000;
const jitter = (ms) => ms * (0.85 + Math.random() * 0.3);

export default function (client, ctx) {
    const c = pick(ctx.coding);
    if (!c) return; // no coding challenge found among the seeded courses
    const page = `/learning/${c.courseId}?lesson=${c.lessonId}`;
    client.get(page, "/learning/:id");
    const ws = json(client.get(`/api/challenges/${c.challengeId}/workspace`, "/api/challenges/:id/workspace"));
    client.think();
    const t0 = Date.now();
    const r = client.action("queueCodeRunAction", page, [{ challengeId: c.challengeId, code: ws?.starterCode || "", kind: "manual" }], "queueCodeRunAction");
    if (!r.action.ok || !r.action.data?.runId) return;
    let status = r.action.data.status;
    // 1.5 s during the first 20 s, then 3 s; both +-15%.
    while (status === "queued" || status === "running") {
        const elapsed = Date.now() - t0;
        if (elapsed > MAX_WAIT_MS) {
            coderunStuck.add(1);
            return;
        }
        sleep(jitter(elapsed < 20000 ? 1500 : 3000) / 1000);
        status = json(client.get(`/api/code-runs/${r.action.data.runId}`, "/api/code-runs/:runId"))?.status;
    }
    coderunTotal.add(Date.now() - t0);
}
