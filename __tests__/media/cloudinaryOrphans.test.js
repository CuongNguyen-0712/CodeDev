import { describe, expect, it } from "vitest";

import { checkOrphansPreconditions, coverPublicId, devAssets, findOrphans, isLocalDbUrl } from "@/lib/media/cloudinaryOrphans.mjs";

const img = (publicId) => ({ publicId, resourceType: "image" });
const refs = (over = {}) => ({ manifests: new Set(), covers: new Set(), dbKeys: new Set(), dbCovers: new Set(), sanity: new Set(), ...over });

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
        for (const name of ["manifests", "covers", "dbKeys", "dbCovers", "sanity"]) {
            expect(() => findOrphans({ assets: [img("codedev/a")], referenced: refs({ [name]: null }) })).toThrow(`reference source missing: ${name}`);
        }
    });

    it("keeps assets referenced by DB covers or Sanity lessons", () => {
        const { orphans } = findOrphans({
            assets: [img("codedev/a"), img("codedev/b"), img("codedev/c")],
            referenced: refs({ dbCovers: new Set(["codedev/a"]), sanity: new Set(["codedev/b"]) }),
        });
        expect(orphans.map((a) => a.publicId)).toEqual(["codedev/c"]);
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

describe("checkOrphansPreconditions", () => {
    const prod = { APP_ENV: "production", DATABASE_URL: "postgres://u:p@db.invalid/x" };
    const full = () => refs({ manifests: new Set(["a"]), covers: new Set(["b"]), dbKeys: new Set(["c"]), dbCovers: new Set(["d"]), sanity: new Set(["e"]) });
    const check = (over = {}) => checkOrphansPreconditions({ envValues: prod, referenced: full(), ...over });

    it("passes with a production env, remote DB and non-empty sources", () => {
        expect(() => check()).not.toThrow();
    });
    it("requires APP_ENV=production in the env file", () => {
        expect(() => check({ envValues: { ...prod, APP_ENV: "development" } })).toThrow("APP_ENV=production");
        expect(() => check({ envValues: { DATABASE_URL: prod.DATABASE_URL } })).toThrow("APP_ENV=production");
    });
    it("refuses local databases, including a host= parameter", () => {
        for (const url of ["postgres://u:p@localhost/x", "postgres://u:p@127.0.0.1:5432/x", "postgres://u:p@[::1]/x", "postgres://u:p@db.invalid/x?host=localhost", "postgres://u:p@db.invalid/x?host=/var/run/postgresql", "postgres://u:p@127.1/x", "postgres://u:p@127.5.6.7/x", "postgres://u:p@0.0.0.0/x", "postgres://u:p@LOCALHOST./x", "postgres://u:p@localhost./x", "postgres://u:p@%2fvar%2frun/x", "postgres://u:p@%2Fvar%2Frun/x", "postgres://u:p@db.invalid/x?host=%2Fvar%2Frun", "not a url"]) {
            expect(isLocalDbUrl(url)).toBe(true);
            expect(() => check({ envValues: { ...prod, DATABASE_URL: url } })).toThrow("local database");
        }
        expect(isLocalDbUrl("postgres://u:p@ep-x.neon.tech/x?sslmode=require")).toBe(false);
    });
    it("requires a database URL", () => {
        expect(() => check({ envValues: { APP_ENV: "production" } })).toThrow("no DATABASE_URL");
    });
    it("refuses empty manifests or covers", () => {
        expect(() => check({ referenced: { ...full(), manifests: new Set() } })).toThrow("empty: manifests");
        expect(() => check({ referenced: { ...full(), covers: new Set() } })).toThrow("empty: covers");
    });
    it("refuses empty dbKeys unless allowed", () => {
        expect(() => check({ referenced: { ...full(), dbKeys: new Set() } })).toThrow("empty: dbKeys");
        expect(() => check({ referenced: { ...full(), dbKeys: new Set() }, allowEmptyDb: true })).not.toThrow();
    });
    it("refuses empty sanity or dbCovers unless allowed", () => {
        expect(() => check({ referenced: { ...full(), sanity: new Set() } })).toThrow("empty: sanity");
        expect(() => check({ referenced: { ...full(), sanity: new Set() }, allowEmptySanity: true })).not.toThrow();
        expect(() => check({ referenced: { ...full(), dbCovers: new Set() } })).toThrow("empty: dbCovers");
        expect(() => check({ referenced: { ...full(), dbCovers: new Set() }, allowEmptyDbCovers: true })).not.toThrow();
        expect(() => check({ referenced: { ...full(), sanity: new Set() }, allowEmptyDbCovers: true })).toThrow("empty: sanity");
    });
    it("refuses a null source", () => {
        expect(() => check({ referenced: { ...full(), sanity: null } })).toThrow("reference source missing: sanity");
    });
});
