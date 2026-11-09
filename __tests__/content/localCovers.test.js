import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { localCoverUpdates } from "../../content/tools/localCovers.mjs";

const course = (root, name, local) => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "course.json"), JSON.stringify({ publicId: `${name}-pid` }));
    if (local) fs.writeFileSync(path.join(dir, "course.local.json"), JSON.stringify({ image: local }));
    return dir;
};

describe("localCoverUpdates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "covers-"));

    it("maps publicId to the local cover URL", () => {
        const a = course(root, "a", "http://127.0.0.1:3010/api/media/file/a.png");
        expect(localCoverUpdates([a])).toEqual({
            updates: [{ publicId: "a-pid", image: "http://127.0.0.1:3010/api/media/file/a.png" }],
            missing: [],
        });
    });

    it("lists courses without course.local.json as missing", () => {
        const b = course(root, "b");
        expect(localCoverUpdates([b])).toEqual({ updates: [], missing: ["b"] });
    });
});
