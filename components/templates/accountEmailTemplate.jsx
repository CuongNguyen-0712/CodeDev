import { Body, Button, Container, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";
import EmailBrandBadge, { EmailFooter, EmailHead } from "./emailBadge";

// Email clients ignore the app's CSS, so brand colours are inlined here.
const BRAND = "#7C3AED";

/**
 * Account messages (docs/email-verification-plan.md 10.8): the link confirmation (with a button)
 * and the "connected" / "disconnected" notices (no button). `lines` are plain paragraphs.
 */
export default function AccountEmailTemplate({ preview, heading, lines = [], action = null, note = null, baseUrl = null }) {
    let resolvedBaseUrl = baseUrl;
    if (!resolvedBaseUrl && action?.url) {
        try {
            resolvedBaseUrl = new URL(action.url).origin;
        } catch {
            // keep fallback
        }
    }

    return (
        <Html lang="en">
            <EmailHead />
            <Preview>{preview}</Preview>
            <Body style={{ backgroundColor: "#f6f6f9", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', margin: 0, padding: "28px 12px" }}>
                <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", maxWidth: 500, padding: "36px 32px", margin: "0 auto" }}>
                    <EmailBrandBadge badge="Security" baseUrl={resolvedBaseUrl} />
                    <Heading as="h1" style={{ color: "#111827", fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>
                        {heading}
                    </Heading>

                    {lines.map((line) => (
                        <Text key={line} style={{ color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 12px" }}>
                            {line}
                        </Text>
                    ))}

                    {action && (
                        <>
                            <Section style={{ margin: "24px 0" }}>
                                <Button
                                    href={action.url}
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
                                    {action.label}
                                </Button>
                            </Section>
                            <Section style={{ backgroundColor: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, padding: "12px 14px", margin: "24px 0 16px" }}>
                                <Text style={{ color: "#6b7280", fontSize: 12, lineHeight: "18px", margin: "0 0 6px" }}>
                                    Or paste this link into your browser:
                                </Text>
                                <Link href={action.url} style={{ color: BRAND, fontSize: 13, lineHeight: "19px", wordBreak: "break-all" }}>
                                    {action.url}
                                </Link>
                            </Section>
                        </>
                    )}

                    {note && (
                        <Section style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", margin: "20px 0 0" }}>
                            <Text style={{ color: "#64748b", fontSize: 13, lineHeight: "20px", margin: 0 }}>
                                {note}
                            </Text>
                        </Section>
                    )}

                    <EmailFooter />
                </Container>
            </Body>
        </Html>
    );
}
