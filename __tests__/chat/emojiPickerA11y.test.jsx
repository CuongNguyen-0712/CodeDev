// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
globalThis.fetch = () => new Promise(() => {}); // never resolves: no network in tests

import { EmojiPicker } from "@/components/shadcn/emoji-picker";

afterEach(cleanup);

it("the search input has an accessible name", () => {
    render(<EmojiPicker />);
    expect(screen.getByRole("searchbox", { name: "Search emoji" })).toBeTruthy();
});
