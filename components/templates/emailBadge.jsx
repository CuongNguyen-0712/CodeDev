import { Body, Button, Column, Container, Head, Heading, Html, Img, Link, Preview, Row, Section, Text } from "@react-email/components";

// Email clients ignore the app's CSS, so brand colours are inlined here.
export const BRAND = "#7C3AED";
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Shell shared by every CodeDev email: head, preview, card, brand header, h1 and footer.
 * Outlook desktop (Word engine) ignores max-width and padding on a <table>: the card gets a
 * width attribute and the padding sits on a <td>. The logo's origin comes from `baseUrl`, else
 * from `linkUrl` (a link in the mail), else from NEXTAUTH_URL.
 */
export function EmailLayout({ preview, badge, baseUrl = null, linkUrl = null, heading, children }) {
    let origin = baseUrl;
    if (!origin && linkUrl) {
        try {
            origin = new URL(linkUrl).origin;
        } catch {
            // keep the NEXTAUTH_URL fallback
        }
    }

    return (
        <Html lang="en">
            <EmailHead />
            <Preview>{preview}</Preview>
            <Body style={{ backgroundColor: "#f6f6f9", fontFamily: FONT, margin: 0, padding: "28px 12px" }}>
                <Container width="500" style={{ width: "100%", maxWidth: 500, backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", margin: "0 auto" }}>
                    <Row>
                        <Column style={{ padding: "36px 32px" }}>
                            <EmailBrandBadge badge={badge} baseUrl={origin} />
                            <Heading as="h1" style={{ color: "#111827", fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>
                                {heading}
                            </Heading>
                            {children}
                            <EmailFooter />
                        </Column>
                    </Row>
                </Container>
            </Body>
        </Html>
    );
}

/**
 * The button plus the "paste this link" fallback. The fallback is left out of the plain-text
 * version, where the button already prints the URL.
 */
export function EmailAction({ label, url }) {
    return (
        <>
            <Section style={{ margin: "24px 0" }}>
                <Button
                    href={url}
                    style={{ backgroundColor: BRAND, borderRadius: 8, color: "#ffffff", fontSize: 15, fontWeight: 600, padding: "12px 24px", textDecoration: "none", display: "inline-block" }}
                >
                    {label}
                </Button>
            </Section>
            <Section data-skip-in-text="true" style={{ backgroundColor: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, margin: "24px 0 16px" }}>
                <Row>
                    <Column style={{ padding: "12px 14px", wordBreak: "break-all", overflowWrap: "anywhere" }}>
                        <Text style={{ color: "#6b7280", fontSize: 12, lineHeight: "18px", margin: "0 0 6px" }}>
                            Or paste this link into your browser:
                        </Text>
                        <Link href={url} style={{ color: BRAND, fontSize: 13, lineHeight: "19px", wordBreak: "break-all", overflowWrap: "anywhere" }}>
                            {url}
                        </Link>
                    </Column>
                </Row>
            </Section>
        </>
    );
}

/** Body paragraph; long emails and names wrap instead of widening the card. */
export const bodyText = { color: "#374151", fontSize: 15, lineHeight: "24px", overflowWrap: "anywhere" };

/**
 * <head> for CodeDev emails: without the viewport meta, mobile webviews lay the message out at
 * desktop width and shrink it; color-scheme says the design is light-only (not dark-mode tested).
 */
export function EmailHead() {
    return (
        <Head>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta name="color-scheme" content="light" />
            <meta name="supported-color-schemes" content="light" />
        </Head>
    );
}

/**
 * Standard brand badge & header for CodeDev transactional emails.
 * Renders the project's circuit brain mark badge alongside the signature `_CodeDev;` wordmark
 * and an optional contextual status badge pill (e.g. "Verification", "Security").
 */
export default function EmailBrandBadge({ badge = null, baseUrl = null }) {
    const origin = baseUrl || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const logoUrl = `${String(origin).replace(/\/+$/, "")}/image/static/logo.png`;

    return (
        <Section style={{ marginBottom: "28px" }}>
            <table cellPadding="0" cellSpacing="0" border="0" style={{ borderCollapse: "collapse" }}>
                <tbody>
                    <tr>
                        <td style={{ verticalAlign: "middle", paddingRight: "12px", width: "36px" }}>
                            <Img
                                src={logoUrl}
                                width="36"
                                height="36"
                                alt="CodeDev"
                                style={{
                                    display: "block",
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "8px",
                                    border: "1px solid #e5e7eb",
                                    // The PNG is transparent: a solid plate keeps it visible when a client darkens the mail.
                                    backgroundColor: "#ffffff",
                                }}
                            />
                        </td>
                        <td style={{ verticalAlign: "middle" }}>
                            <Text
                                style={{
                                    margin: 0,
                                    fontSize: "19px",
                                    fontWeight: "700",
                                    lineHeight: "24px",
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                    letterSpacing: "-0.5px",
                                }}
                            >
                                <span style={{ color: "#EA580C" }}>_</span>
                                <span style={{ color: "#7C3AED" }}>CodeDev</span>
                                <span style={{ color: "#DB2777" }}>;</span>
                            </Text>
                        </td>
                        {badge && (
                            <td data-skip-in-text="true" style={{ verticalAlign: "middle", paddingLeft: "12px" }}>
                                <span
                                    style={{
                                        display: "inline-block",
                                        backgroundColor: "#f3e8ff",
                                        color: "#7C3AED",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        padding: "3px 9px",
                                        borderRadius: "9999px",
                                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                    }}
                                >
                                    {badge}
                                </span>
                            </td>
                        )}
                    </tr>
                </tbody>
            </table>
        </Section>
    );
}

/**
 * Standard footer for CodeDev emails. No "you can ignore this" here: security notices ask the
 * reader to act, so each email says it itself only where ignoring is safe.
 */
export function EmailFooter() {
    return (
        <Section style={{ marginTop: "32px", borderTop: "1px solid #e5e7eb", paddingTop: "20px" }}>
            <Text style={{ color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: 0 }}>
                © {new Date().getFullYear()} CodeDev, interactive developer courses.
            </Text>
        </Section>
    );
}
