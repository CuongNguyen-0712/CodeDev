// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ImageLightbox } from "@/components/ui/imageLightbox";

afterEach(cleanup);

describe("ImageLightbox gallery", () => {
    const images = [
        { src: "/a.png", alt: "A", original: "/orig/a" },
        { src: "/b.png", alt: "B" },
        { src: "/c.png", alt: "C" },
    ];
    const open = async (props) => {
        render(<ImageLightbox images={images} {...props}><img src="/b.png" alt="" /></ImageLightbox>);
        fireEvent.click(screen.getByRole("button", { name: "View larger image" }));
        return screen.findByRole("dialog");
    };

    it("opens at the given index, moves with the buttons and the arrow keys, and wraps", async () => {
        const dialog = await open({ index: 1 });
        expect(dialog.querySelector("img").getAttribute("src")).toBe("/b.png");
        expect(screen.getByText("2 / 3")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Next image" }));
        expect(dialog.querySelector("img").getAttribute("src")).toBe("/c.png");
        fireEvent.keyDown(dialog, { key: "ArrowRight" });
        expect(dialog.querySelector("img").getAttribute("src")).toBe("/a.png");
        fireEvent.keyDown(dialog, { key: "ArrowLeft" });
        expect(dialog.querySelector("img").getAttribute("src")).toBe("/c.png");
    });

    it("offers Open original only for an image that has one", async () => {
        const dialog = await open({ index: 0 });
        const link = screen.getByRole("link", { name: "Open original" });
        expect(link.getAttribute("href")).toBe("/orig/a");
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.getAttribute("rel")).toBe("noopener noreferrer");
        fireEvent.keyDown(dialog, { key: "ArrowRight" });
        expect(screen.queryByRole("link", { name: "Open original" })).toBeNull();
    });

    it("hides the arrows and the counter for one image", async () => {
        render(<ImageLightbox images={[images[0]]}><img src="/a.png" alt="" /></ImageLightbox>);
        fireEvent.click(screen.getByRole("button", { name: "View larger image" }));
        await screen.findByRole("dialog");
        expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Previous image" })).toBeNull();
        expect(screen.queryByText(/ \/ /)).toBeNull();
    });

    it("shows the error text when the image fails to load", async () => {
        const dialog = await open({ index: 0 });
        fireEvent.error(dialog.querySelector("img"));
        expect(screen.getByText("This image could not be loaded")).toBeTruthy();
    });

    it("looks exactly as before for an existing single-image caller", async () => {
        render(<ImageLightbox src="/x.png" alt="X" caption="Cap"><img src="/x.png" alt="X" /></ImageLightbox>);
        fireEvent.click(screen.getByRole("button", { name: "View larger image" }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog.querySelector("img").getAttribute("src")).toBe("/x.png");
        expect(screen.queryByRole("button", { name: /Previous image|Next image/ })).toBeNull();
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByText(/could not be loaded| \/ /)).toBeNull();
        expect(screen.getByText("Cap")).toBeTruthy();
    });
});
