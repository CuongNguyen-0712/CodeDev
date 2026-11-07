import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake SMTP: records which server each send went to; servers in `down` throw.
const smtp = vi.hoisted(() => ({ sent: [], down: new Set() }));
vi.mock("nodemailer", () => ({
    default: {
        createTransport: ({ host }) => ({
            sendMail: async () => {
                smtp.sent.push(host);
                if (smtp.down.has(host)) throw new Error(`${host} refused: daily limit`);
                return { messageId: `<id@${host}>` };
            },
            verify: async () => true,
        }),
    },
}));

const { sendMail } = await import("@/lib/mail.js");

const MESSAGE = { to: "learner@example.com", subject: "Verify", html: "<p>hi</p>", text: "hi" };
const BOTH = {
    APP_ENV: "development",
    AGENTMAIL_API_KEY: "am_secret_key", AGENTMAIL_FROM: "CodeDev <codedev@agentmail.to>",
    MAIL_FROM: "team@gmail.com", MAIL_PASSWORD: "gmailsecretpass",
};

function useEnv(values) {
    for (const name of ["APP_ENV", "AGENTMAIL_API_KEY", "AGENTMAIL_FROM", "AGENTMAIL_HOST", "MAIL_FROM", "MAIL_PASSWORD", "MAIL_HOST", "MAIL_PORT"]) {
        vi.stubEnv(name, values[name] ?? "");
    }
}

describe("sendMail fallback", () => {
    beforeEach(() => {
        smtp.sent.length = 0;
        smtp.down.clear();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("sends through AgentMail and never touches Gmail when AgentMail works", async () => {
        useEnv(BOTH);
        await expect(sendMail(MESSAGE)).resolves.toBe("<id@smtp.agentmail.to>");
        expect(smtp.sent).toEqual(["smtp.agentmail.to"]);
    });

    it("falls back to Gmail on any AgentMail error", async () => {
        useEnv(BOTH);
        smtp.down.add("smtp.agentmail.to");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(sendMail(MESSAGE)).resolves.toBe("<id@smtp.gmail.com>");
        expect(smtp.sent).toEqual(["smtp.agentmail.to", "smtp.gmail.com"]);
        expect(warn.mock.calls.join()).toMatch(/agentmail failed, trying gmail/);
    });

    it("throws one error naming both servers, without secrets, when both fail", async () => {
        useEnv(BOTH);
        smtp.down.add("smtp.agentmail.to").add("smtp.gmail.com");
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const error = await sendMail(MESSAGE).catch((caught) => caught);
        expect(error.message).toMatch(/smtp\.agentmail\.to.*refused.*smtp\.gmail\.com.*refused/s);
        expect(error.message).not.toContain("am_secret_key");
        expect(error.message).not.toContain("gmailsecretpass");
    });

    it("throws the configuration error when no route is set", async () => {
        useEnv({ APP_ENV: "production" });
        await expect(sendMail(MESSAGE)).rejects.toThrow(/not set/);
        expect(smtp.sent).toEqual([]);
    });
});
