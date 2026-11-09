import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve("content/tools/build-lesson.mjs");
const dirs = [];

const entry = (url, extra = {}) => ({ key: "k", url, width: 10, height: 20, format: "svg", bytes: 1, checksum: "c", ...extra });

function lesson({ assets, local }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-"));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, "lesson.source.mjs"), `export default ({ image, video }) => ({ _id: "l1", title: "T", content: [image("d", { alt: "a" }), video("v", { title: "Clip" })] });\n`);
    fs.writeFileSync(path.join(dir, "challenges.json"), JSON.stringify({ challenges: [] }));
    if (assets) fs.writeFileSync(path.join(dir, "assets.json"), JSON.stringify(assets));
    if (local) fs.writeFileSync(path.join(dir, "assets.local.json"), JSON.stringify(local));
    return dir;
}
const build = (dir, ...flags) => execFileSync(process.execPath, [script, dir, ...flags], { encoding: "utf8", stdio: "pipe" });
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));

afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const video = (url) => ({ v: entry(url, { mime: "video/mp4" }) });

describe("build-lesson --target", () => {
    it("payload target uses assets.local.json", () => {
        const dir = lesson({
            assets: { images: { d: entry("https://res.cloudinary.com/d.svg") }, videos: video("https://res.cloudinary.com/v.mp4") },
            local: { images: { d: entry("http://127.0.0.1:3010/api/media/file/d.svg") }, videos: video("http://127.0.0.1:3010/api/media/file/v.mp4") },
        });
        build(dir, "--target", "payload");
        expect(read(dir, "lesson.payload.json").content[0].url).toBe("http://127.0.0.1:3010/api/media/file/d.svg");
        expect(fs.existsSync(path.join(dir, "lesson.sanity.json"))).toBe(false);
    });

    it("payload target never reads assets.json", () => {
        const dir = lesson({ assets: { images: { d: entry("https://res.cloudinary.com/d.svg") } } });
        let err;
        try { build(dir, "--target", "payload"); } catch (e) { err = e; }
        expect(err.status).not.toBe(0);
        expect(String(err.stderr)).toContain('image "d" is not in assets.local.json - run upload-media.mjs');
    });

    it("sanity target names the production upload when a key is missing", () => {
        const dir = lesson({ local: { images: { d: entry("http://127.0.0.1:3010/d.svg") } } });
        let err;
        try { build(dir); } catch (e) { err = e; }
        expect(err.status).not.toBe(0);
        expect(String(err.stderr)).toContain('image "d" is not in assets.json - run upload-media.mjs <lesson> --env .env.production');
    });

    it("video blocks carry the manifest file", () => {
        const dir = lesson({ local: { images: { d: entry("http://127.0.0.1:3010/d.svg") }, videos: video("http://127.0.0.1:3010/v.mp4") } });
        build(dir, "--target", "payload");
        expect(read(dir, "lesson.payload.json").content[1]).toMatchObject({ _type: "video", url: "http://127.0.0.1:3010/v.mp4", title: "Clip", mime: "video/mp4", width: 10, height: 20 });
    });

    it("default target is unchanged", () => {
        const dir = lesson({ assets: { images: { d: { url: "https://res.cloudinary.com/d.svg", publicId: "p", width: 1, height: 2 } }, videos: video("https://res.cloudinary.com/v.mp4") }, local: { images: { d: entry("http://127.0.0.1:3010/d.svg") } } });
        build(dir);
        expect(read(dir, "lesson.sanity.json").content[0]).toMatchObject({ url: "https://res.cloudinary.com/d.svg", publicId: "p" });
        expect(fs.existsSync(path.join(dir, "lesson.payload.json"))).toBe(false);
    });
});
