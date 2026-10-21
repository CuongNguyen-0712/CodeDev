#!/usr/bin/env node
/**
 * Runs the lesson pipeline for every lesson listed in content/courses/<course>/course.json:
 *
 *   verify-challenges -> upload-images -> upload-storage -> build-lesson   (per lesson)
 *   build-seed                                                            (once, whole course)
 *   push-lesson                                                           (per lesson, with --push)
 *
 * Usage:
 *   node content/tools/build-course.mjs content/courses/<course>                 # local storage (.env.local)
 *   node content/tools/build-course.mjs content/courses/<course> --push          # also write Sanity drafts
 *   node content/tools/build-course.mjs content/courses/<course> --only 02-event-loop-async-pitfalls
 *   --skip-uploads   reuse assets.json / storage-manifest.json (no Cloudinary / S3 calls)
 *   --storage-env <file>   env file for upload-storage (default .env.local)
 *   --storage-only   only run upload-storage for every lesson (e.g. with --storage-env .env.production)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tools = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const courseDir = path.resolve(args[0]);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const course = JSON.parse(fs.readFileSync(path.join(courseDir, "course.json"), "utf8"));
const only = option("--only", null);
const storageEnv = option("--storage-env", ".env.local");

const run = (tool, ...toolArgs) => {
    console.log(`\n$ ${tool} ${toolArgs.map((a) => path.basename(a)).join(" ")}`);
    execFileSync(process.execPath, [path.join(tools, tool), ...toolArgs], { stdio: "inherit" });
};

const lessons = (course.modules || []).flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.orderIndex })))
    .filter((l) => !l.existing && (!only || l.folder === only));

if (flag("--storage-only")) {
    // Only (re)upload starter/harness files, e.g. to production storage with --storage-env .env.production.
    for (const lesson of lessons) run("upload-storage.mjs", path.join(courseDir, lesson.folder), "--env", storageEnv);
    process.exit(0);
}

for (const lesson of lessons) {
    const dir = path.join(courseDir, lesson.folder);
    console.log(`\n=== ${lesson.module}.${lesson.orderIndex} ${lesson.title} (${lesson.folder})`);
    if (!fs.existsSync(path.join(dir, "lesson.source.mjs"))) throw new Error(`${lesson.folder}: lesson.source.mjs is missing`);

    run("verify-challenges.mjs", dir);
    if (!flag("--skip-uploads")) {
        if (fs.existsSync(path.join(dir, "diagrams"))) run("upload-images.mjs", dir);
        run("upload-storage.mjs", dir, "--env", storageEnv);
    }
    run("build-lesson.mjs", dir);
}

run("build-seed.mjs", courseDir);

if (flag("--push")) {
    for (const lesson of lessons) run("push-lesson.mjs", path.join(courseDir, lesson.folder));
}
