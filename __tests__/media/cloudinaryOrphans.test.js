import { describe, expect, it } from "vitest";

import { coverPublicId, devAssets, findOrphans } from "@/lib/media/cloudinaryOrphans.mjs";

const img = (publicId) => ({ publicId, resourceType: "image" });
const refs = (over = {}) => ({ manifests: new Set(), covers: new Set(), dbKeys: new Set(), ...over });

describe("findOrphans", () => {
    it("keeps assets referenced by any of the three sources", () => {
        const assets = [img("codedev/a"), img("codedev/b"), img("codedev/c"), img("codedev/d")];
        const { keep, orphans } = findOrphans({
            assets,
            referenced: refs({ manifests: new Set(["codedev/a"]), covers: new Set(["codedev/b"]), dbKeys: new Set(["codedev/c"]) }),
        });
        expect(keep.map((a) => a.publicId)).toEqual(["codedev/a", "codedev/b", "codedev/c"]);
        expect(orphans.map((a) => a.publicId)).toEqual(["codedev/d"]);
    });

    it("orphans the old codedev/courses tree once references moved to production/", () => {
        const { orphans } = findOrphans({
            assets: [img("codedev/courses/x/cover"), img("codedev/production/courses/x/cover")],
            referenced: refs({ dbKeys: new Set(["codedev/production/courses/x/cover"]) }),
        });
        expect(orphans.map((a) => a.publicId)).toEqual(["codedev/courses/x/cover"]);
    });

    it("refuses without every reference source", () => {
        for (const name of ["manifests", "covers", "dbKeys"]) {
            expect(() => findOrphans({ assets: [img("codedev/a")], referenced: refs({ [name]: null }) })).toThrow(`reference source missing: ${name}`);
        }
    });

    it("never touches assets outside codedev/", () => {
        const { keep, orphans } = findOrphans({ assets: [img("other/a")], referenced: refs() });
        expect(orphans).toEqual([]);
        expect(keep).toHaveLength(1);
    });
});

describe("devAssets", () => {
    it("matches only dev and test folders", () => {
        const got = devAssets([img("codedev/development/a"), img("codedev/test/b"), img("codedev/production/users/c"), img("codedev/developmentx/d"), img("codedev/courses/e")]);
        expect(got.map((a) => a.publicId)).toEqual(["codedev/development/a", "codedev/test/b"]);
    });
});

describe("coverPublicId", () => {
    it("strips transformations, version and query", () => {
        const url = "https://res.cloudinary.com/demo/image/upload/c_limit,w_1600/f_auto,q_auto/v1/codedev/courses/x/cover?_a=x";
        expect(coverPublicId(url)).toBe("codedev/courses/x/cover");
        expect(coverPublicId("https://res.cloudinary.com/d/image/upload/v1793945029/codedev/courses/x/cover.png?_a=B")).toBe("codedev/courses/x/cover");
    });

    it("ignores non-Cloudinary URLs", () => {
        expect(coverPublicId("/image/static/default.svg")).toBeNull();
        expect(coverPublicId("http://localhost:3000/api/media/file/x.png")).toBeNull();
        expect(coverPublicId(null)).toBeNull();
    });
});
