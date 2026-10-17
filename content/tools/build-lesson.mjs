#!/usr/bin/env node
/**
 * Builds a lesson's Sanity document from <lesson>/lesson.source.mjs:
 *
 *   export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }, { images }) => ({
 *       _id, title, slug, description, estimatedTime, scenario, environmentSetup,
 *       content: [h2("..."), p("Text with `inline code` and **bold**."), image("race-timeline", { alt }), challenge("chal_x")],
 *   })
 *
 * `images` comes from <lesson>/assets.json (content/tools/upload-images.mjs). Keys are
 * derived from block positions, so rebuilding an unchanged source gives the same JSON.
 * Answers and test cases never go here: they live in challenges.json -> Postgres.
 *
 * Usage: node content/tools/build-lesson.mjs <lesson folder>   -> <lesson>/lesson.sanity.json
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const lessonDir = path.resolve(process.argv[2]);
const assetsPath = path.join(lessonDir, "assets.json");
const { images = {} } = fs.existsSync(assetsPath) ? JSON.parse(fs.readFileSync(assetsPath, "utf8")) : {};
const { challenges = [] } = JSON.parse(fs.readFileSync(path.join(lessonDir, "challenges.json"), "utf8"));

let counter = 0;
const key = (salt = "") => createHash("sha1").update(`${++counter}:${salt}`).digest("hex").slice(0, 12);

// "Plain `code` and **bold**" -> Portable Text spans
function spans(text) {
    return String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/).filter(Boolean).map((part) => {
        if (part.startsWith("`")) return { _type: "span", _key: key(part), text: part.slice(1, -1), marks: ["code"] };
        if (part.startsWith("**")) return { _type: "span", _key: key(part), text: part.slice(2, -2), marks: ["strong"] };
        return { _type: "span", _key: key(part), text: part, marks: [] };
    });
}

const block = (style, text, extra = {}) => ({ _type: "block", _key: key(text), style, markDefs: [], children: spans(text), ...extra });
const list = (listItem) => (items) => items.map((text) => block("normal", text, { listItem, level: 1 }));

const helpers = {
    h2: (text) => block("h2", text),
    h3: (text) => block("h3", text),
    p: (text) => block("normal", text),
    quote: (text) => block("blockquote", text),
    bullets: list("bullet"),
    numbered: list("number"),
    code: (language, code, filename) => ({ _type: "codeBlock", _key: key(code), language, ...(filename && { filename }), code: code.replace(/^\n/, "").replace(/\s+$/, "") }),
    callout: (type, title, content) => ({ _type: "callout", _key: key(content), type, title, content }),
    image: (name, { alt, caption }) => {
        const img = images[name];
        if (!img) throw new Error(`image "${name}" is not in assets.json - run upload-images.mjs first`);
        return { _type: "cloudinaryImage", _key: key(name), url: img.url, publicId: img.publicId, alt, ...(caption && { caption }), width: img.width, height: img.height };
    },
    challenge: (challengePublicId, hint) => {
        if (!challenges.some((c) => c.publicId === challengePublicId)) throw new Error(`challenge "${challengePublicId}" is not in challenges.json`);
        return { _type: "challengeEmbed", _key: key(challengePublicId), challengePublicId, ...(hint && { hint }) };
    },
};

const { default: source } = await import(pathToFileURL(path.join(lessonDir, "lesson.source.mjs")).href);
const doc = source(helpers, { images });

// Flatten list helpers (they return arrays) and number setup steps.
doc.content = doc.content.flat();
if (doc.environmentSetup?.setupSteps) {
    doc.environmentSetup.setupSteps = doc.environmentSetup.setupSteps.map((step) => ({ _type: "setupStep", _key: key(step.label), ...step }));
}

const embedded = new Set(doc.content.filter((b) => b._type === "challengeEmbed").map((b) => b.challengePublicId));
const missing = challenges.filter((c) => !embedded.has(c.publicId)).map((c) => c.publicId);

const target = path.join(lessonDir, "lesson.sanity.json");
fs.writeFileSync(target, JSON.stringify({ _type: "lesson", published: true, ...doc }, null, 2) + "\n");
console.log(`wrote ${target} (${doc.content.length} blocks, ${embedded.size} embedded challenges${missing.length ? `; shown in Practice section: ${missing.join(", ")}` : ""})`);
