// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let session = { user: { id: "pub_me" } };
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session, status: session ? "authenticated" : "unauthenticated" }) }));
vi.mock("@/components/profile/profilePage", () => ({ CourseList: () => null, LanguageList: () => null, Stat: () => null, initials: () => "X" }));
vi.mock("@/components/ranking/rankSummary", () => ({ RankSummary: () => null }));
vi.mock("@/components/ui/level", () => ({ ExpProgress: () => null, LevelBadge: () => null, levelProgress: () => ({ level: 1, title: "t", exp: 0 }) }));
vi.mock("@/components/ui/imageLightbox", () => ({ ImageLightbox: ({ children }) => <div>{children}</div> }));

const { default: PublicProfilePage } = await import("@/components/profile/publicProfilePage");
afterEach(cleanup);

const profile = (id) => ({ id, username: "ann", nickname: "Ann", image: null, byStatus: {}, courses: [], languages: [] });

describe("Message button on the public profile", () => {
    it("links to the conversation for someone else", () => {
        render(<PublicProfilePage profile={profile("pub_ann")} />);
        expect(screen.getByRole("link", { name: /Message/ }).getAttribute("href")).toBe("/messages/new?to=pub_ann");
    });
    it("is hidden for yourself", () => {
        render(<PublicProfilePage profile={profile("pub_me")} />);
        expect(screen.queryByRole("link", { name: /Message/ })).toBeNull();
    });
    it("is hidden when signed out", () => {
        session = null;
        render(<PublicProfilePage profile={profile("pub_ann")} />);
        expect(screen.queryByRole("link", { name: /Message/ })).toBeNull();
        session = { user: { id: "pub_me" } };
    });
});
