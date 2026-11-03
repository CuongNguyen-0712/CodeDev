// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Renders the catalog page with its real hooks and components; only the network, the router and
 * the session are replaced. Catches what lint cannot: a page that throws while rendering.
 */
const search = { value: "" };

vi.mock("next/navigation", () => ({
    usePathname: () => "/course",
    useSearchParams: () => new URLSearchParams(search.value),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated", data: null }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));

const getList = vi.fn();
vi.mock("@/clients/course.client", () => ({
    courseClient: {
        getList: (params) => getList(params),
        getFilters: async () => ({ languages: [], categories: [], roles: [], industries: [], skills: [] }),
    },
}));

const course = (id, title) => ({
    id, title, image: null, rating: null, modules: 2, lessons: 10, level: "beginner", access_model: "free",
    language_name: "TypeScript", language_logo: null, category_name: "Testing", is_registered: null,
});

beforeAll(() => {
    window.matchMedia ??= () => ({ matches: false, addEventListener() { }, removeEventListener() { } });
    window.IntersectionObserver ??= class { observe() { } unobserve() { } disconnect() { } };
});
afterEach(() => {
    cleanup();
    getList.mockReset();
});

async function renderPage() {
    const { default: CoursePage } = await import("@/components/course/coursePage");
    const { TooltipProvider } = await import("@/components/shadcn/tooltip");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <CoursePage />
            </TooltipProvider>
        </QueryClientProvider>
    );
}

describe("CoursePage", () => {
    it("lists the courses the API returns, in the API's order", async () => {
        search.value = "";
        getList.mockResolvedValue({ data: [course("b", "Beta course"), course("a", "Alpha course")], hasMore: false, lastId: null });
        await renderPage();

        const titles = await screen.findAllByText(/^(Alpha|Beta) course$/);
        expect(titles.map((el) => el.textContent)).toEqual(["Beta course", "Alpha course"]);
    });

    it("asks the API for the order in the URL and shows it in the sort control", async () => {
        search.value = "sort=title";
        getList.mockResolvedValue({ data: [course("a", "Alpha course"), course("b", "Beta course")], hasMore: false, lastId: null });
        await renderPage();

        await screen.findByText("Alpha course");
        expect(getList).toHaveBeenCalledWith(expect.objectContaining({ sort: "title" }));
        expect(screen.getByRole("combobox", { name: /sort by/i }).textContent).toMatch(/alphabetical/i);
    });

    it("shows an empty state instead of a blank list", async () => {
        search.value = "";
        getList.mockResolvedValue({ data: [], hasMore: false, lastId: null });
        await renderPage();

        expect(await screen.findByRole("heading", { name: /no courses/i })).toBeTruthy();
    });
});
