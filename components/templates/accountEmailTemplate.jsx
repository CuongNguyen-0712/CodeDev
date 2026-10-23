import { Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";

// Email clients ignore the app's CSS, so the brand colours are inlined here.
const BRAND = "#7C3AED";

/**
 * Account messages (docs/email-verification-plan.md 10.8): the link confirmation (with a button)
 * and the "connected" / "disconnected" notices (no button). `lines` are plain paragraphs.
 */
export default function AccountEmailTemplate({ preview, heading, lines = [], action = null, note = null }) {
    return (
        <Html lang="en">
            <Head />
            <Preview>{preview}</Preview>
            <Body style={{ backgroundColor: "#f6f6f9", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
                <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 480, padding: "32px 28px" }}>
                    <Text style={{ color: BRAND, fontSize: 18, fontWeight: 700, margin: 0 }}>CodeDev</Text>
                    <Heading as="h1" style={{ color: "#111827", fontSize: 22, margin: "24px 0 12px" }}>
                        {heading}
                    </Heading>
                    {lines.map((line) => (
                        <Text key={line} style={{ color: "#374151", fontSize: 15, lineHeight: "24px" }}>{line}</Text>
                    ))}
                    {action && (
                        <>
                            <Section style={{ margin: "24px 0" }}>
                                <Button
                                    href={action.url}
                                    style={{ backgroundColor: BRAND, borderRadius: 8, color: "#ffffff", fontSize: 15, fontWeight: 600, padding: "12px 20px", textDecoration: "none" }}
                                >
                                    {action.label}
                                </Button>
                            </Section>
                            <Text style={{ color: "#6b7280", fontSize: 13, lineHeight: "20px" }}>
                                Or paste this link into your browser:{" "}
                                <Link href={action.url} style={{ color: BRAND, wordBreak: "break-all" }}>{action.url}</Link>
                            </Text>
                        </>
                    )}
                    {note && <Text style={{ color: "#6b7280", fontSize: 13, lineHeight: "20px" }}>{note}</Text>}
                </Container>
            </Body>
        </Html>
    );
}
