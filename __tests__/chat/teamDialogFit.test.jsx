// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("next/link", () => ({ default: ({ children, ...p }) => <a {...p}>{children}</a> }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

import { TeamFormContent } from "@/components/chat/newTeamDialog";
import { PersonList } from "@/components/contact/personRow";
import { Dialog } from "@/components/shadcn/dialog";

afterEach(cleanup);

it("TeamFormContent never runs past the screen", () => {
    render(
        <Dialog open>
            <TeamFormContent title="t" description="d" submitLabel="Go" canSubmit pending={false} onSubmit={() => {}} onCancel={() => {}} />
        </Dialog>,
    );
    const cls = document.querySelector("[data-slot=dialog-content]").className;
    expect(cls).toContain("max-h-[calc(100dvh-2rem)]");
    expect(cls).toContain("overflow-y-auto");
});

it("loading rows size their optional columns by the list, not the screen", () => {
    const { container } = render(
        <PersonList query={{ isLoading: true, data: undefined }} noun="friends" errorTitle="x" empty={null} renderRow={() => null} />,
    );
    expect(container.querySelector("ul").className).toContain("@container");
    const skeletons = [...container.querySelectorAll("li [class*=block]")].map((e) => e.className);
    expect(skeletons.some((c) => /(^|\s)sm:block|(^|\s)md:block/.test(c))).toBe(false);
    expect(skeletons.some((c) => c.includes("@sm:block"))).toBe(true);
    expect(skeletons.some((c) => c.includes("@md:block"))).toBe(true);
});
