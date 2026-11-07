// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ImageLightbox, largeImageUrl } from "@/components/ui/imageLightbox";

afterEach(cleanup);

describe("ImageLightbox", () => {
    it("opens the image larger on click and closes on Escape", async () => {
        render(
            <ImageLightbox src="https://res.cloudinary.com/x/big.png" alt="Diagram" label="View larger image">
                <img src="https://res.cloudinary.com/x/big.png" alt="Diagram" />
            </ImageLightbox>
        );

        fireEvent.click(screen.getByRole("button", { name: "View larger image" }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://res.cloudinary.com/x/big.png");

        fireEvent.keyDown(dialog, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("renders only the children when there is no image", () => {
        render(<ImageLightbox src={null}><span>initials</span></ImageLightbox>);
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.getByText("initials")).toBeTruthy();
    });

    it("asks providers for a large avatar and leaves other URLs alone", () => {
        expect(largeImageUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe("https://lh3.googleusercontent.com/a/abc=s512-c");
        expect(largeImageUrl("https://avatars.githubusercontent.com/u/1?v=4")).toBe("https://avatars.githubusercontent.com/u/1?v=4&s=512");
        expect(largeImageUrl("https://res.cloudinary.com/x/a.png")).toBe("https://res.cloudinary.com/x/a.png");
        expect(largeImageUrl("/local.png")).toBe("/local.png");
    });
});
