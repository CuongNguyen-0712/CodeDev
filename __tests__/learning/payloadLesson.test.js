import { beforeEach, describe, expect, it, vi } from "vitest";

const sanityFetch = vi.fn();
vi.mock("@/lib/sanity", () => ({ client: { fetch: (...args) => sanityFetch(...args) } }));
vi.mock("@/lib/cache", () => ({ redis: { remember: (key, ttl, loader) => loader() } }));

const { getLessonContent, getPayloadLesson, lessonSource } = await import("@/lib/lessonContent");

const env = { NODE_ENV: "development", PAYLOAD_URL: "http://127.0.0.1:3010", PAYLOAD_API_KEY: "k" };
const doc = { title: "Package the API", slug: "docker-multi-stage", description: "d", estimatedTime: 15, scenario: { role: "r" }, content: [{ _type: "block" }] };
const ok = (body) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

describe("lessonSource", () => {
    it("reads Sanity when deployed and Payload locally, unless overridden", () => {
        expect(lessonSource({ APP_ENV: "production" })).toBe("sanity");
        expect(lessonSource({ APP_ENV: "staging" })).toBe("sanity");
        expect(lessonSource({ NODE_ENV: "production" })).toBe("sanity");
        expect(lessonSource({ NODE_ENV: "development" })).toBe("payload");
        expect(lessonSource({ NODE_ENV: "development", LESSON_CONTENT_SOURCE: "sanity" })).toBe("sanity");
        expect(lessonSource({ APP_ENV: "production", LESSON_CONTENT_SOURCE: "Payload" })).toBe("payload");
    });
});

describe("getPayloadLesson", () => {
    it("maps the Payload document to the Sanity lesson shape and authenticates with the API key", async () => {
        const fetchImpl = ok({ docs: [doc] });
        const lesson = await getPayloadLesson("lesson-dkn-1-1", { env, fetchImpl });

        expect(lesson).toEqual({
            title: "Package the API",
            slug: { _type: "slug", current: "docker-multi-stage" },
            description: "d",
            estimatedTime: 15,
            scenario: { role: "r" },
            environmentSetup: null,
            content: [{ _type: "block" }],
        });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url.searchParams.get("where[sourceId][equals]")).toBe("lesson-dkn-1-1");
        expect(init.headers.Authorization).toBe("users API-Key k");
    });

    it("returns null for a missing lesson", async () => {
        expect(await getPayloadLesson("x", { env, fetchImpl: ok({ docs: [] }) })).toBeNull();
    });

    it("answers 503 when the CMS is not configured, refuses the key or is down", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(getPayloadLesson("x", { env: { NODE_ENV: "development" }, fetchImpl: ok({}) })).rejects.toMatchObject({ status: 503 });
        await expect(getPayloadLesson("x", { env, fetchImpl: vi.fn(async () => ({ ok: false, status: 403 })) })).rejects.toMatchObject({ status: 503 });
        await expect(getPayloadLesson("x", { env, fetchImpl: vi.fn(async () => { throw new TypeError("fetch failed"); }) })).rejects.toMatchObject({ status: 503 });
        warn.mockRestore();
    });
});

describe("getLessonContent", () => {
    beforeEach(() => {
        sanityFetch.mockReset();
        vi.unstubAllEnvs();
    });

    it("reads only Sanity in production", async () => {
        vi.stubEnv("APP_ENV", "production");
        sanityFetch.mockResolvedValue({ title: "From Sanity", content: [] });
        expect(await getLessonContent("lesson-1")).toEqual({ title: "From Sanity", content: [] });
    });

    it("reads only Payload locally, never Sanity", async () => {
        vi.stubEnv("APP_ENV", "development");
        vi.stubEnv("PAYLOAD_URL", env.PAYLOAD_URL);
        vi.stubEnv("PAYLOAD_API_KEY", env.PAYLOAD_API_KEY);
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ docs: [doc] }) });
        expect((await getLessonContent("lesson-dkn-1-1")).title).toBe("Package the API");
        expect(sanityFetch).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});
