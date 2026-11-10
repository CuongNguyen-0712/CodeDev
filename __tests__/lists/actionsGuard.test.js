import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Every server action export must be an async *Action function that goes through runAction. */
const DIR = path.resolve("actions");
const files = readdirSync(DIR).filter((name) => name.endsWith(".actions.js"));
const read = (name) => readFileSync(path.join(DIR, name), "utf8");

describe("server action files", () => {
    it.each(files)("%s: 'use server', and every export is an async action wrapped in runAction", (name) => {
        const source = read(name);
        expect(source).toMatch(/^\s*['"]use server['"]/);
        const exported = source.match(/^export\b/gm) || [];
        const actions = source.match(/^export async function \w+Action\(/gm) || [];
        const wrapped = source.match(/runAction\(/g) || [];
        expect(exported.length).toBeGreaterThan(0);
        expect(actions.length).toBe(exported.length);
        expect(wrapped.length).toBe(actions.length);
    });

    it("only the feedback action skips sign-in", () => {
        expect(files.filter((name) => /auth:\s*false/.test(read(name)))).toEqual(["feedback.actions.js"]);
    });

    it("only the profile update accepts a locked account, once", () => {
        expect(files.filter((name) => read(name).includes("allowLocked"))).toEqual(["user.actions.js"]);
        expect(read("user.actions.js").match(/allowLocked/g)).toHaveLength(1);
    });
});
