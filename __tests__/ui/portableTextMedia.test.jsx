// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.stubEnv("NEXT_PUBLIC_MEDIA_ORIGINS", "https://res.cloudinary.com,http://127.0.0.1:3010");
const { default: PortableTextRenderer } = await import("@/components/ui/portableTextRenderer");

afterEach(cleanup);

const image = (url) => [{ _type: "cloudinaryImage", _key: "a", url, alt: "Diagram" }];

describe("PortableTextRenderer media", () => {
    it("renders a local Payload image", () => {
        const { container } = render(<PortableTextRenderer value={image("http://127.0.0.1:3010/api/media/file/race-timeline.svg")} />);
        expect(container.querySelector("img")?.getAttribute("src")).toBe("http://127.0.0.1:3010/api/media/file/race-timeline.svg");
    });

    it("skips an image from a foreign origin", () => {
        const { container } = render(<PortableTextRenderer value={image("https://evil.example/x.png")} />);
        expect(container.querySelector("img")).toBeNull();
    });

    it("skips a direct video from a foreign origin, keeps an allowed one", () => {
        const video = (url) => [{ _type: "video", _key: "v", url, title: "t" }];
        expect(render(<PortableTextRenderer value={video("https://evil.example/v.mp4")} />).container.querySelector("video")).toBeNull();
        cleanup();
        expect(render(<PortableTextRenderer value={video("http://127.0.0.1:3010/api/media/file/v.mp4")} />).container.querySelector("video")).not.toBeNull();
    });
});
