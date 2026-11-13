// Maps server action names to their ids from .next/server/server-reference-manifest.json: node scripts/loadtest/actions.mjs <manifest>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ACTIONS = [
    "recordLessonVisitAction",
    "submitQuizAction",
    "submitLessonAction",
    "registerCourseAction",
    "sendFriendRequestAction",
    "respondFriendRequestAction",
    "sendMessageAction",
    "queueCodeRunAction",
];

export function mapActions(manifest, names) {
    const entries = Object.entries(manifest.node ?? {});
    const out = {};
    const missing = [];
    for (const name of names) {
        const hits = entries.filter(([, e]) => e.exportedName === name);
        if (hits.length !== 1) {
            missing.push(`${name} (${hits.length} matches)`);
            continue;
        }
        out[name] = { id: hits[0][0], workers: Object.keys(hits[0][1].workers) };
    }
    if (missing.length) throw new Error(`Server actions not found in the manifest: ${missing.join(", ")}`);
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const file = process.argv[2];
    if (!file) {
        console.error("usage: actions.mjs <server-reference-manifest.json>");
        process.exit(1);
    }
    const map = mapActions(JSON.parse(fs.readFileSync(file, "utf8")), ACTIONS);
    const dest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/loadtest/actions.json");
    fs.writeFileSync(dest, JSON.stringify(map, null, 2));
    console.log(`wrote ${ACTIONS.length} actions to tests/loadtest/actions.json`);
}
