import { expect, it } from "vitest";
import { cookieHeader, parseSetCookies } from "@/scripts/loadtest/http.mjs";

it("keeps the last value per cookie name and drops cleared cookies", () => {
    const jar = parseSetCookies([
        "next-auth.session-token=abc; Path=/; HttpOnly",
        "cd_refresh=r1; Path=/; HttpOnly; SameSite=Strict",
        "next-auth.session-token.0=; Max-Age=0; Path=/",
    ]);
    expect(jar).toEqual({ "next-auth.session-token": "abc", cd_refresh: "r1" });
    expect(cookieHeader(jar)).toBe("next-auth.session-token=abc; cd_refresh=r1");
});
