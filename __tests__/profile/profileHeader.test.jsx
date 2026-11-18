// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "me" } }, status: "authenticated" }) }));
vi.mock("@tanstack/react-query", () => ({
    useQuery: () => ({ data: { username: "ann", name: "Ann", surname: "Lee" }, isLoading: false, isError: false }),
    useInfiniteQuery: () => ({ data: undefined }),
}));
vi.mock("@/queries/user.query", () => ({ userQueries: { me: () => ({}), overview: () => ({}), privacy: () => ({}), ranks: () => ({}) } }));
vi.mock("@/components/profile/experienceSection", () => ({ default: () => null }));
vi.mock("@/components/profile/achievementsSection", () => ({ default: () => null }));
vi.mock("@/components/ranking/rankSummary", () => ({ RankSummary: () => null, MyRankSummary: () => null }));
vi.mock("@/components/ui/level", () => ({ ExpProgress: () => null, LevelBadge: () => null, levelProgress: () => ({ level: 1, title: "t", exp: 0 }) }));
vi.mock("@/components/ui/imageLightbox", () => ({ ImageLightbox: ({ children }) => <div>{children}</div> }));

const { default: PublicProfilePage } = await import("@/components/profile/publicProfilePage");
const { default: ProfilePage } = await import("@/components/profile/profilePage");
afterEach(cleanup);

const profile = { id: "pub_ann", username: "ann", nickname: "Ann Long Name", image: null, byStatus: {}, courses: [], languages: [] };

describe("profile header", () => {
    it("public profile: name is text-2xl md:text-4xl with line-clamp-2 and a title of the full name", () => {
        render(<PublicProfilePage profile={profile} />);
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1.className).toContain("text-2xl");
        expect(h1.className).toContain("md:text-4xl");
        expect(h1.className).toContain("line-clamp-2");
        expect(h1.getAttribute("title")).toBe("Ann Long Name");
    });
    it("public profile: header is a column below md and a row from md; Message button is w-full md:w-auto", () => {
        const { container } = render(<PublicProfilePage profile={profile} />);
        const header = container.querySelector("header");
        expect(header.className).toContain("flex-col");
        expect(header.className).toContain("md:flex-row");
        const button = screen.getByRole("link", { name: /Message/ });
        expect(button.className).toContain("w-full");
        expect(button.className).toContain("md:w-auto");
    });
    it("own profile: name uses the same size and clamp classes", () => {
        render(<ProfilePage />);
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1.className).toContain("text-2xl");
        expect(h1.className).toContain("md:text-4xl");
        expect(h1.className).toContain("line-clamp-2");
        expect(h1.getAttribute("title")).toBe("Lee Ann");
    });
});
