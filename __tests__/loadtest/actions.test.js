import { expect, it } from "vitest";
import { mapActions } from "@/scripts/loadtest/actions.mjs";
import fixture from "./fixtures/server-reference-manifest.json";

// Fixture: server-reference-manifest.json from a real `next build` of this app (Next 16.4.3), trimmed to the 8 load-test actions.
it("maps every needed action to its id", () => {
    const map = mapActions(fixture, ["submitQuizAction", "sendMessageAction"]);
    expect(map.submitQuizAction.id).toMatch(/^[0-9a-f]{40,}$/);
    expect(map.sendMessageAction.workers.length).toBeGreaterThan(0);
});
it("names the missing action", () => {
    expect(() => mapActions(fixture, ["nopeAction"])).toThrow(/nopeAction/);
});
