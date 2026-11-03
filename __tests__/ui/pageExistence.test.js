import { beforeEach, describe, expect, it, vi } from "vitest";

const courseExists = vi.fn();
const roadmapExists = vi.fn();
const profileExists = vi.fn();

vi.mock("@/db/course.db", () => ({ courseDb: { courseExists: (id) => courseExists(id) } }));
vi.mock("@/db/roadmap", () => ({ roadmapDb: { exists: (id) => roadmapExists(id) } }));
vi.mock("@/db/profile.db", () => ({ profileDb: { publicProfileExists: (key) => profileExists(key) } }));

const rows = (n) => ({ rowCount: n });

describe("pageExists (proxy 404 check)", () => {
    let pageExists;
    beforeEach(async () => {
        vi.resetModules();
        courseExists.mockReset();
        roadmapExists.mockReset();
        profileExists.mockReset();
        ({ pageExists } = await import("@/lib/pageExistence"));
    });

    it("answers for course, roadmap and profile ids and leaves other paths alone", async () => {
        courseExists.mockResolvedValue(rows(1));
        profileExists.mockResolvedValue(rows(0));
        expect(await pageExists("/course/react-basics")).toBe(true);
        expect(await pageExists("/profile/nobody")).toBe(false);
        expect(await pageExists("/course")).toBe(true);
        expect(await pageExists("/learning/react-basics")).toBe(true);
        expect(courseExists).toHaveBeenCalledWith("react-basics");
    });

    it("rejects a roadmap id that is not a uuid without asking the database", async () => {
        expect(await pageExists("/roadmap/not-a-uuid")).toBe(false);
        expect(roadmapExists).not.toHaveBeenCalled();
    });

    it("decodes the segment, and a malformed one is a 404", async () => {
        profileExists.mockResolvedValue(rows(1));
        expect(await pageExists("/profile/Nguy%E1%BB%85n")).toBe(true);
        expect(profileExists).toHaveBeenCalledWith("Nguyễn");
        expect(await pageExists("/course/%E0%A4%A")).toBe(false);
    });

    it("remembers answers, so a visited page is not looked up again", async () => {
        courseExists.mockResolvedValue(rows(1));
        await pageExists("/course/a");
        await pageExists("/course/a");
        expect(courseExists).toHaveBeenCalledTimes(1);
    });

    it("lets the page decide when the lookup fails", async () => {
        courseExists.mockRejectedValue(new Error("db down"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await pageExists("/course/a")).toBe(true);
    });
});
