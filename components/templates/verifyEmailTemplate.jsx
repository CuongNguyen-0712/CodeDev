import { Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";

// Email clients ignore the app's CSS, so the brand colours are inlined here.
const BRAND = "#7C3AED";

/**
 * "Verify your email" message (docs/email-verification-plan.md 6.6). `deadline` (a formatted
 * date) adds the deletion notice of never-verified accounts (11.2).
 */
export default function VerifyEmailTemplate({ name, email, url, hours, deadline = null }) {
    return (
        <Html lang="en">
            <Head />
            <Preview>Confirm {email} to finish setting up your CodeDev account.</Preview>
            <Body style={{ backgroundColor: "#f6f6f9", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
                <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 480, padding: "32px 28px" }}>
                    <Text style={{ color: BRAND, fontSize: 18, fontWeight: 700, margin: 0 }}>CodeDev</Text>
                    <Heading as="h1" style={{ color: "#111827", fontSize: 22, margin: "24px 0 12px" }}>
                        Verify your email
                    </Heading>
                    <Text style={{ color: "#374151", fontSize: 15, lineHeight: "24px" }}>
                        Hi {name || "there"}, confirm that {email} is your email address for CodeDev.
                    </Text>
                    {deadline && (
                        <Text style={{ color: "#374151", fontSize: 15, lineHeight: "24px", fontWeight: 600 }}>
                            Verify by {deadline}. Accounts that are never verified are deleted, with all their data, after 7 days.
                        </Text>
                    )}
                    {deadline && (
                        <Text style={{ color: "#374151", fontSize: 15, lineHeight: "24px", fontWeight: 600 }}>
                            Verify by {deadline}. Accounts that are never verified are deleted, with all their data, after 7 days.
                        </Text>
                    )}
                    <Section style={{ margin: "24px 0" }}>
                        <Button
                            href={url}
                            style={{ backgroundColor: BRAND, borderRadius: 8, color: "#ffffff", fontSize: 15, fontWeight: 600, padding: "12px 20px", textDecoration: "none" }}
                        >
                            Verify email
                        </Button>
                    </Section>
                    <Text style={{ color: "#6b7280", fontSize: 13, lineHeight: "20px" }}>
                        Or paste this link into your browser:{" "}
                        <Link href={url} style={{ color: BRAND, wordBreak: "break-all" }}>{url}</Link>
                    </Text>
                    <Text style={{ color: "#6b7280", fontSize: 13, lineHeight: "20px" }}>
                        This link expires in {hours} hours. If you did not create a CodeDev account, ignore this email.
                    </Text>
                </Container>
            </Body>
        </Html>
    );
}
