import { Body, Button, Container, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";
import EmailBrandBadge, { EmailFooter, EmailHead } from "./emailBadge";

// Email clients ignore the app's CSS, so brand colours are inlined here.
const BRAND = "#7C3AED";

/**
 * "Verify your email" message (docs/email-verification-plan.md 6.6). Formatted dates add notices:
 * `lockDeadline` = end of the 7-day grace period, still ahead (12); `deadline` = deletion of a
 * never-verified account (11.2). With a deadline and no lockDeadline the account is locked already.
 */
export default function VerifyEmailTemplate({ name, email, url, hours = 24, lockDeadline = null, deadline = null, baseUrl = null }) {
    const notices = [];
    if (lockDeadline) notices.push(`Verify by ${lockDeadline} to keep using CodeDev. After that, you need to verify before you can use your account.`);
    if (lockDeadline && deadline) notices.push(`Accounts that are never verified are deleted, with all their data, on ${deadline}.`);
    if (!lockDeadline && deadline) notices.push(`Your account is locked until you verify. Verify by ${deadline}, or the account and all its data are deleted.`);

    let resolvedBaseUrl = baseUrl;
    if (!resolvedBaseUrl && url) {
        try {
            resolvedBaseUrl = new URL(url).origin;
        } catch {
            // keep fallback
        }
    }

    return (
        <Html lang="en">
            <EmailHead />
            <Preview>Confirm {email} to finish setting up your CodeDev account.</Preview>
            <Body style={{ backgroundColor: "#f6f6f9", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', margin: 0, padding: "28px 12px" }}>
                <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", maxWidth: 500, padding: "36px 32px", margin: "0 auto" }}>
                    <EmailBrandBadge badge="Verification" baseUrl={resolvedBaseUrl} />
                    <Heading as="h1" style={{ color: "#111827", fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>
                        Verify your email
                    </Heading>
                    <Text style={{ color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" }}>
                        {`Hi ${name || "there"}, confirm that ${email} is your email address for CodeDev.`}
                    </Text>

                    {notices.length > 0 && (
                        <Section
                            style={{
                                backgroundColor: "#fffbeb",
                                border: "1px solid #fde68a",
                                borderRadius: 8,
                                padding: "14px 16px",
                                margin: "20px 0",
                            }}
                        >
                            {notices.map((notice, i) => (
                                <Text key={notice} style={{ color: "#92400e", fontSize: 14, lineHeight: "20px", fontWeight: i === 0 ? 600 : 400, margin: i === 0 ? 0 : "8px 0 0" }}>
                                    {notice}
                                </Text>
                            ))}
                        </Section>
                    )}

                    <Section style={{ margin: "24px 0" }}>
                        <Button
                            href={url}
                            style={{
                                backgroundColor: BRAND,
                                borderRadius: 8,
                                color: "#ffffff",
                                fontSize: 15,
                                fontWeight: 600,
                                padding: "12px 24px",
                                textDecoration: "none",
                                display: "inline-block",
                            }}
                        >
                            Verify email
                        </Button>
                    </Section>

                    <Section style={{ backgroundColor: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, padding: "12px 14px", margin: "24px 0 16px" }}>
                        <Text style={{ color: "#6b7280", fontSize: 12, lineHeight: "18px", margin: "0 0 6px" }}>
                            Or paste this link into your browser:
                        </Text>
                        <Link href={url} style={{ color: BRAND, fontSize: 13, lineHeight: "19px", wordBreak: "break-all" }}>
                            {url}
                        </Link>
                    </Section>

                    <Text style={{ color: "#6b7280", fontSize: 13, lineHeight: "20px", margin: "16px 0 0" }}>
                        {`This link expires in ${hours} hours. If you did not create a CodeDev account, ignore this email.`}
                    </Text>

                    <EmailFooter />
                </Container>
            </Body>
        </Html>
    );
}
