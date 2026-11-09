import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { coverPublicId } from "@/lib/media/cloudinaryOrphans.mjs";
import { readCovers, readManifests } from "@/lib/media/cloudinaryReferences.mjs";

const root = process.cwd();

describe("readers against the real content/courses tree", () => {
    it("reads manifest public ids, all under codedev/", () => {
        const ids = readManifests(root);
        expect(ids.size).toBeGreaterThan(0);
        for (const id of ids) expect(id.startsWith("codedev/")).toBe(true);
    });

    it("resolves every top-level course.json image to a public id", () => {
        const dir = path.join(root, "content", "courses");
        const files = fs.readdirSync(dir).map((n) => path.join(dir, n, "course.json")).filter((f) => fs.existsSync(f));
        expect(files.length).toBeGreaterThan(0);
        for (const f of files) {
            const c = JSON.parse(fs.readFileSync(f, "utf8"));
            expect(coverPublicId(c.image), f).not.toBeNull();
        }
        expect(readCovers(root).size).toBeGreaterThan(0);
    });
});
