#!/usr/bin/env node
/**
 * Loads lesson bodies into the local Payload CMS, the lesson store of local development
 * (docs/payload-cms.md). Offline apart from the local CMS: images come from the committed
 * assets.json, nothing is uploaded and nothing is written to Sanity.
 *
 * For every lesson of every written course (or the courses given): rebuilds lesson.sanity.json
 * when it is missing or older than lesson.source.mjs / challenges.json / assets.json, then writes
 * it to Payload with push-lesson-payload.mjs.
 *
 * Usage:
 *   node content/tools/payload-sync.mjs                      # every course with lessons
 *   node content/tools/payload-sync.mjs content/courses/<course> [...]
 *   --env <file>   env file with PAYLOAD_URL and PAYLOAD_API_KEY (default .env.local)
 *   --rebuild      rebuild every lesson.sanity.json (after a change to build-lesson.mjs)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tools = path.dirname(fileURLToPath(import.meta.url));
const coursesRoot = path.resolve(tools, "..", "courses");
const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const given = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--env").map((a) => path.resolve(a));
const courseDirs = given.length ? given : fs.readdirSync(coursesRoot).map((c) => path.join(coursesRoot, c)).filter((d) => fs.existsSync(path.join(d, "course.json")));

const mtime = (file) => (fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0);
const node = (tool, toolArgs) => execFileSync(process.execPath, [path.join(tools, tool), ...toolArgs], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

let failures = 0;
let total = 0;
for (const courseDir of courseDirs) {
    const course = JSON.parse(fs.readFileSync(path.join(courseDir, "course.json"), "utf8"));
    const folders = (course.modules || []).flatMap((m) => m.lessons).filter((l) => !l.existing).map((l) => path.join(courseDir, l.folder));
    if (!folders.length) continue;

    let built = 0;
    const ready = [];
    for (const dir of folders) {
        const target = args.includes("--rebuild") ? 0 : mtime(path.join(dir, "lesson.sanity.json"));
        const newest = Math.max(...["lesson.source.mjs", "challenges.json", "assets.json"].map((f) => mtime(path.join(dir, f))));
        try {
            if (!target || target < newest) {
                node("build-lesson.mjs", [dir]);
                built++;
            }
            ready.push(dir);
        } catch (error) {
            console.error(`${course.publicId}/${path.basename(dir)}: build-lesson failed\n${String(error.stderr || error.message).trim().split("\n").slice(-3).join("\n")}`);
            failures++;
        }
    }

    try {
        const out = ready.length ? node("push-lesson-payload.mjs", [...ready, "--env", envFile]) : "";
        const written = out.split("\n").filter((l) => /^(created|updated) /.test(l)).length;
        total += written;
        console.log(`${course.publicId}: ${written}/${folders.length} lessons in Payload${built ? ` (${built} rebuilt)` : ""}`);
    } catch (error) {
        console.error(`${course.publicId}: push failed\n${String(error.stderr || error.stdout || error.message).trim()}`);
        failures++;
    }
}
console.log(`\n${total} lessons written${failures ? `, ${failures} failure(s)` : ""}.`);
process.exitCode = failures ? 1 : 0;
