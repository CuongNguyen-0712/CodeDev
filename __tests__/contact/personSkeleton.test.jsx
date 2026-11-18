// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("next/link", () => ({ default: ({ children, ...p }) => <a {...p}>{children}</a> }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

import { PersonList, PersonSkeletonWithActions } from "@/components/contact/personRow";
import { ContactSkeleton } from "@/components/contact/contactPage";

afterEach(cleanup);

const loading = { isLoading: true, data: undefined };
const list = (extra) => (
    <PersonList query={loading} noun="x" errorTitle="x" empty={null} renderRow={() => null} {...extra} />
);

it("PersonList renders the given skeleton while loading, and the default otherwise", () => {
    const Custom = () => <li data-testid="custom" />;
    const { container, unmount } = render(list({ skeleton: Custom }));
    expect(container.querySelectorAll("[data-testid=custom]")).toHaveLength(6);
    unmount();
    const def = render(list());
    expect(def.container.querySelectorAll("li")).toHaveLength(6);
    expect(def.container.querySelector("[data-testid=custom]")).toBeNull();
    expect(def.container.querySelector("li [class*='@sm:block']")).not.toBeNull();
});

it("PersonSkeletonWithActions has the PersonRow right-cluster classes", () => {
    const { container } = render(<ul><PersonSkeletonWithActions /></ul>);
    const cluster = container.querySelector("li > div:last-child");
    expect(cluster.className).toBe("flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2");
    expect(container.querySelector("li").className).toContain("flex items-center gap-3 px-4 py-3");
    expect(container.querySelector("li .size-9.rounded-full")).not.toBeNull();
    expect(cluster.querySelector(".h-5.w-12.rounded-full")).not.toBeNull();
    expect(cluster.querySelector(".h-8.w-20.rounded-md")).not.toBeNull();
    expect(cluster.querySelector(".size-8.rounded-md")).not.toBeNull();
});

it("Find people, Friends and Invitations pass the actions skeleton; the friend picker does not", () => {
    const src = (p) => readFileSync(p, "utf8");
    const pass = "skeleton={PersonSkeletonWithActions}";
    for (const f of ["contactPage", "friendsTab", "invitationsTab"]) {
        expect(src(`components/contact/${f}.jsx`)).toContain(pass);
    }
    expect(src("components/chat/friendPicker.jsx")).not.toContain("skeleton=");
});

it("ContactSkeleton renders Find people layout with list rows and no aspect-video card grid", () => {
    const { container } = render(<ContactSkeleton />);
    expect(container.querySelector("h1")?.textContent).toBe("Contacts");
    expect(container.querySelectorAll("[role=tab]")).toHaveLength(3);
    expect(container.querySelector("input[placeholder='Search by username...']")).not.toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(container.querySelector(".aspect-video")).toBeNull();
});

it("app/(shell)/contact/page.jsx uses ContactSkeleton as Suspense fallback", () => {
    const src = readFileSync("app/(shell)/contact/page.jsx", "utf8");
    expect(src).toContain("fallback={<ContactSkeleton />}");
    expect(src).not.toContain("PageSkeleton");
});
