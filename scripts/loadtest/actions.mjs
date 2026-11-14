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

/** name -> id from client chunks of a deployed build, where each action is `createServerReference)("<id>",…,"<exportName>")`. */
export function parseActionRefs(js) {
    const out = {};
    for (const m of js.matchAll(/createServerReference\)\("([0-9a-f]+)",[\w$]+\.callServer,void 0,[\w$]+\.findSourceMapURL,"([\w$]+)"\)/g)) out[m[2]] = m[1];
    return out;
}

// Deployed builds (e.g. a Vercel preview) have their own ids and no reachable manifest: read them from the pages' client chunks,
// fetched with the first minted session. node scripts/loadtest/actions.mjs --base <url> --pages /learning/<id>,/contact,...
async function remoteActions(base, pages) {
    const { cookieHeader } = await import("./http.mjs");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const [session] = JSON.parse(fs.readFileSync(path.join(root, "tests/loadtest/sessions.json"), "utf8"));
    const headers = { cookie: cookieHeader(session.cookies) };
    const chunks = new Set();
    for (const page of pages) {
        const html = await (await fetch(base + page, { headers })).text();
        for (const m of html.matchAll(/\/?_next\/static\/[^"\\]+?\.js/g)) chunks.add("/" + m[0].replace(/^\//, ""));
    }
    const refs = {};
    for (const c of chunks) Object.assign(refs, parseActionRefs(await (await fetch(base + c)).text()));
    const missing = ACTIONS.filter((n) => !refs[n]);
    if (missing.length) throw new Error(`Server actions not found in the pages' chunks: ${missing.join(", ")} (add the page that uses them to --pages)`);
    return Object.fromEntries(ACTIONS.map((n) => [n, { id: refs[n], workers: [] }]));
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "--base") {
    const pagesAt = process.argv.indexOf("--pages");
    const map = await remoteActions(process.argv[3].replace(/\/$/, ""), process.argv[pagesAt + 1].split(","));
    const dest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/loadtest/actions.json");
    fs.writeFileSync(dest, JSON.stringify(map, null, 2));
    console.log(`wrote ${Object.keys(map).length} actions to tests/loadtest/actions.json`);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
