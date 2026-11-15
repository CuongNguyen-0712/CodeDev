import { expect, it } from "vitest";
import { cookieHeader, parseSetCookies, sessionCookies } from "@/scripts/loadtest/http.mjs";

it("keeps the last value per cookie name and drops cleared cookies", () => {
    const jar = parseSetCookies([
        "next-auth.session-token=abc; Path=/; HttpOnly",
        "cd_refresh=r1; Path=/; HttpOnly; SameSite=Strict",
        "next-auth.session-token.0=; Max-Age=0; Path=/",
    ]);
    expect(jar).toEqual({ "next-auth.session-token": "abc", cd_refresh: "r1" });
    expect(cookieHeader(jar)).toBe("next-auth.session-token=abc; cd_refresh=r1");
});

it("keeps session and refresh cookies under plain and secure names, drops csrf", () => {
    const plain = { "next-auth.csrf-token": "c", "next-auth.session-token": "s", cd_refresh: "r" };
    expect(sessionCookies(plain)).toEqual({ "next-auth.session-token": "s", cd_refresh: "r" });
    const secure = { "__Host-next-auth.csrf-token": "c", "__Secure-next-auth.session-token.0": "s0", "__Host-cd_refresh": "r" };
    expect(sessionCookies(secure)).toEqual({ "__Secure-next-auth.session-token.0": "s0", "__Host-cd_refresh": "r" });
});

it("returns null when the session or refresh cookie is missing", () => {
    expect(sessionCookies({ "__Secure-next-auth.session-token": "s" })).toBeNull();
    expect(sessionCookies({ "__Host-cd_refresh": "r" })).toBeNull();
});
