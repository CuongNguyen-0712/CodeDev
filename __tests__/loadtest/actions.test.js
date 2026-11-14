import { expect, it } from "vitest";
import { mapActions, parseActionRefs } from "@/scripts/loadtest/actions.mjs";
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

it("reads action ids and names from deployed client chunks", () => {
    const js = 'x=(0,r.createServerReference)("40a2748d56aca9cae6ea72f72054817ed59c0c5e71",r.callServer,void 0,r.findSourceMapURL,"registerCourseAction"),'
        + 'y=(0,n.createServerReference)("7f11aa",n.callServer,void 0,n.findSourceMapURL,"submitQuizAction")';
    expect(parseActionRefs(js)).toEqual({ registerCourseAction: "40a2748d56aca9cae6ea72f72054817ed59c0c5e71", submitQuizAction: "7f11aa" });
});
