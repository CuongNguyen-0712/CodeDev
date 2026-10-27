import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";

import VerifyEmailTemplate from "@/components/templates/verifyEmailTemplate";
import AccountEmailTemplate from "@/components/templates/accountEmailTemplate";

describe("Email templates", () => {
    describe("VerifyEmailTemplate", () => {
        it("renders the brand badge, logo mark, heading and action link", async () => {
            const element = React.createElement(VerifyEmailTemplate, {
                name: "Alex",
                email: "alex@example.com",
                url: "https://codedev.example/auth/verify-email?token=0123456789abcdef",
                hours: 24,
            });

            const html = await render(element);
            const text = await render(element, { plainText: true });

            // Mobile mail webviews need the viewport meta, or they shrink the desktop layout.
            expect(html).toContain('name="viewport"');

            // Brand logo and wordmark
            expect(html).toContain("logo.png");
            expect(html).toContain("CodeDev");
            expect(html).toContain("Verification");

            // Content
            expect(html).toContain("Verify your email");
            expect(html).toContain("alex@example.com");
            expect(html).toContain("https://codedev.example/auth/verify-email?token=0123456789abcdef");

            // Plain text check
            expect(text).toContain("https://codedev.example/auth/verify-email?token=0123456789abcdef");
            expect(text).toContain("24 hours");
        });

        it("renders the deadline warning callout when a deadline is provided", async () => {
            const element = React.createElement(VerifyEmailTemplate, {
                name: "Alex",
                email: "alex@example.com",
                url: "https://codedev.example/auth/verify-email?token=123",
                hours: 24,
                deadline: "31 Oct 2026",
            });

            const html = await render(element);
            const text = await render(element, { plainText: true });

            expect(html).toContain("Your account is locked until you verify. Verify by 31 Oct 2026");
            expect(text).toContain("Your account is locked until you verify. Verify by 31 Oct 2026");
        });

        it("quotes the lock date and the deletion date during the grace period", async () => {
            const element = React.createElement(VerifyEmailTemplate, {
                name: "Alex",
                email: "alex@example.com",
                url: "https://codedev.example/auth/verify-email?token=123",
                lockDeadline: "2 Nov 2026",
                deadline: "9 Nov 2026",
            });

            const text = await render(element, { plainText: true });

            expect(text).toContain("Verify by 2 Nov 2026 to keep using CodeDev.");
            expect(text).toContain("are deleted, with all their data, on 9 Nov 2026.");
            expect(text).not.toContain("locked until");
        });
    });

    describe("AccountEmailTemplate", () => {
        it("renders action button and note when provided", async () => {
            const element = React.createElement(AccountEmailTemplate, {
                preview: "Confirm linking GitHub to CodeDev",
                heading: "Link GitHub to your account",
                lines: ["Hi Alex, please confirm linking your GitHub account."],
                action: {
                    label: "Link GitHub",
                    url: "https://codedev.example/auth/link/confirm?token=abcdef&mode=claim",
                },
                note: "This link expires in 30 minutes.",
            });

            const html = await render(element);
            const text = await render(element, { plainText: true });

            expect(html).toContain("logo.png");
            expect(html).toContain("CodeDev");
            expect(html).toContain("Security");
            expect(html).toContain("Link GitHub to your account");
            expect(html).toContain("Link GitHub");
            expect(html).toContain("This link expires in 30 minutes.");

            expect(text).toContain("mode=claim");
            expect(text).toContain("This link expires in 30 minutes.");
        });

        it("renders notice emails without action button cleanly", async () => {
            const element = React.createElement(AccountEmailTemplate, {
                preview: "GitHub connected to your CodeDev account",
                heading: "GitHub connected",
                lines: [
                    "Hi Alex, a GitHub account was connected on 24 Oct 2026.",
                    "Your password was changed and every device was signed out.",
                ],
                note: "Not you? Check Settings > Sign-in methods.",
            });

            const html = await render(element);
            const text = await render(element, { plainText: true });

            expect(html).toContain("GitHub connected");
            expect(html).toContain("Your password was changed");
            expect(text).toContain("Your password was changed");
        });
    });
});
