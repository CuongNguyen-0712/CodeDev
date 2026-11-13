import { Body, Button, Container, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";
import EmailBrandBadge, { EmailFooter, EmailHead } from "./emailBadge";

// Email clients ignore the app's CSS, so brand colours are inlined here.
const BRAND = "#7C3AED";

/**
 * Account messages (docs/email-verification-plan.md 10.8): the link confirmation (with a button)
 * and the "connected" / "disconnected" notices (no button). `lines` are plain paragraphs;
 * `noteAction` ({ label, url }) is a link after the note, e.g. "Not you?" to Settings.
 */
export default function AccountEmailTemplate({ preview, heading, lines = [], action = null, note = null, noteAction = null, baseUrl = null }) {
    let resolvedBaseUrl = baseUrl;
    const linkUrl = action?.url || noteAction?.url;
    if (!resolvedBaseUrl && linkUrl) {
        try {
            resolvedBaseUrl = new URL(linkUrl).origin;
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

                    {lines.map((line, i) => (
                        <Text key={i} style={{ color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 12px" }}>
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

                    {/* Body-weight ink, no box: on a notice this is the only thing the reader can do. */}
                    {note && (
                        <Text style={{ color: "#111827", fontSize: 15, lineHeight: "24px", fontWeight: 600, margin: "20px 0 0" }}>
                            {note}
                            {noteAction && (
                                <>
                                    {" "}
                                    <Link href={noteAction.url} style={{ color: BRAND, textDecoration: "underline" }}>
                                        {noteAction.label}
                                    </Link>
                                </>
                            )}
                        </Text>
                    )}

                    <EmailFooter />
                </Container>
            </Body>
        </Html>
    );
}
