#!/usr/bin/env node
/**
 * Runs the lesson pipeline for every lesson listed in content/courses/<course>/course.json:
 *
 *   build-pieces -> verify-challenges -> upload-media -> upload-storage -> build-lesson   (per lesson)
 *   build-seed                                                            (once, whole course)
 *   push-lesson                                                           (per lesson, with --push)
 *   push-lesson-payload                                                   (per lesson, with --payload)
 *
 * Usage:
 *   node content/tools/build-course.mjs content/courses/<course>                 # local storage (.env.local)
 *   node content/tools/build-course.mjs content/courses/<course> --payload       # also write the local Payload CMS
 *   node content/tools/build-course.mjs content/courses/<course> --push          # also write Sanity drafts (production)
 *   node content/tools/build-course.mjs content/courses/<course> --push --publish   # write published Sanity documents
 *   --push-env <file>  env file for push-lesson (default .env.production; must be production or staging)
 *   node content/tools/build-course.mjs content/courses/<course> --only 02-event-loop-async-pitfalls
 *   --payload        also write the lessons to the local Payload CMS (docs/payload-cms.md)
 *   --skip-uploads   reuse the media manifests / storage-manifest.json (no Cloudinary / Payload / S3 calls)
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

    run("build-pieces.mjs", dir);
    run("verify-challenges.mjs", dir);
    if (!flag("--skip-uploads")) {
        if (["diagrams", "videos"].some((d) => fs.existsSync(path.join(dir, d)))) run("upload-media.mjs", dir, "--env", storageEnv);
        run("upload-storage.mjs", dir, "--env", storageEnv);
    }
    run("build-lesson.mjs", dir);
}

run("build-seed.mjs", courseDir);

if (flag("--payload")) {
    run("push-lesson-payload.mjs", ...lessons.map((lesson) => path.join(courseDir, lesson.folder)));
}

if (flag("--push")) {
    const pushEnv = option("--push-env", ".env.production");
    for (const lesson of lessons) run("push-lesson.mjs", path.join(courseDir, lesson.folder), "--env", pushEnv, ...(flag("--publish") ? ["--publish"] : []));
}
