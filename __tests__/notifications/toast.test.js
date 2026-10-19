import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { toast } from "sonner";

import { notify } from "@/components/ui/alert";

const root = path.resolve(__dirname, "..", "..");

// Sonner defers dismissals to the next frame; the node test environment has no rAF.
globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 5));

afterEach(async () => {
    toast.dismiss();
    await nextFrame();
});

describe("notify (useApp().showAlert)", () => {
    it("maps status codes onto toast types", () => {
        notify(200, "saved");
        notify(0, "info");
        notify(500, "boom");
        notify(409, "conflict");
        const types = toast.getToasts().map((t) => [t.title, t.type]);
        expect(types).toEqual([["saved", "success"], ["info", "info"], ["boom", "error"], ["conflict", "warning"]]);
    });

    it("ignores empty messages", () => {
        notify(200, "   ");
        notify(200, undefined);
        expect(toast.getToasts()).toHaveLength(0);
    });

    it("collapses repeats of one event that carry the same id", () => {
        notify(200, "Challenge passed: +30 points", { id: "challenge-passed:42" });
        notify(200, "Challenge passed: +30 points", { id: "challenge-passed:42" });
        notify(200, "Challenge passed: +30 points", { id: "challenge-passed:43" });
        expect(toast.getToasts().map((t) => t.id)).toEqual(["challenge-passed:42", "challenge-passed:43"]);
    });

    it("keeps separate events with the same text apart when they have no id", () => {
        notify(200, "Saved");
        notify(200, "Saved");
        expect(toast.getToasts()).toHaveLength(2);
    });

    it("a dismissed toast is gone from the store (its timer can no longer fire)", async () => {
        const id = notify(200, "bye");
        toast.dismiss(id);
        await nextFrame();
        expect(toast.getToasts()).toHaveLength(0);
    });
});

describe("toast region lifecycle", () => {
    // The bug: Sonner replays every active toast to each Toaster that subscribes, and every
    // remount restarts its timer. This is the behaviour that made per-layout Toasters re-show
    // a toast after each navigation, so the app must mount exactly one Toaster.
    it("a newly mounted Toaster is handed the still-active toasts (why remounting replays them)", () => {
        notify(200, "still active");
        const replayed = toast.getToasts();
        expect(replayed.map((t) => t.title)).toEqual(["still active"]);
    });

    it("renders the toast region exactly once, in the root providers", () => {
        const sources = [];
        const walk = (dir) => {
            for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
                const rel = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(rel);
                else if (/\.(jsx?|tsx?)$/.test(entry.name)) sources.push(rel);
            }
        };
        ["app", "components", "contexts", "hooks"].forEach(walk);

        const mounts = sources.filter((file) => /<(AppToaster|Toaster|AlertPush)\b/.test(fs.readFileSync(path.join(root, file), "utf8")));
        // components/ui/alert.jsx defines AppToaster (it renders the shadcn Toaster); providers mounts it.
        expect(mounts.map((f) => f.split(path.sep).join("/")).sort()).toEqual(["components/ui/alert.jsx", "contexts/providers.jsx"]);
        expect(fs.readFileSync(path.join(root, "contexts/providers.jsx"), "utf8").match(/<AppToaster\b/g)).toHaveLength(1);
    });
});
