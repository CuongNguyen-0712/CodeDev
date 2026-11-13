import { Body, Button, Column, Container, Head, Heading, Html, Img, Link, Preview, Row, Section, Text } from "@react-email/components";

/**
 * Light-theme tokens of app/globals.css, inlined because email clients ignore the app's CSS.
 * Keep them in step with --foreground, --muted-foreground, --canvas, --border, --primary and --warning*.
 */
export const COLOR = {
    ink: "#17141F",
    muted: "#605B6E",
    canvas: "#F7F6FA",
    card: "#FFFFFF",
    border: "#D6D1DF",
    brand: "#7C3AED",
    warning: "#B45309",
    warningSoft: "#FDF5E6",
};
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Body paragraph; long emails and names wrap instead of widening the card. */
export const bodyText = { color: COLOR.ink, fontSize: 16, lineHeight: "24px", overflowWrap: "anywhere" };
/** Secondary line: expiry, "ignore this", footer. */
export const smallText = { color: COLOR.muted, fontSize: 13, lineHeight: "20px" };

/**
 * Shell shared by every CodeDev email: head, preview, card, wordmark, h1 and footer.
 * Outlook desktop (Word engine) ignores max-width and padding on a <table>: the card gets a
 * width attribute and the padding sits on a <td>. The logo's origin comes from `baseUrl`, else
 * from `linkUrl` (a link in the mail), else from NEXTAUTH_URL.
 */
export function EmailLayout({ preview, baseUrl = null, linkUrl = null, heading, children }) {
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
            <Body style={{ backgroundColor: COLOR.canvas, fontFamily: FONT, margin: 0, padding: "28px 12px" }}>
                <Container width="500" style={{ width: "100%", maxWidth: 500, backgroundColor: COLOR.card, borderRadius: 12, border: `1px solid ${COLOR.border}`, margin: "0 auto" }}>
                    <Row>
                        <Column style={{ padding: "36px 32px" }}>
                            <EmailBrandBadge baseUrl={origin} />
                            <Heading as="h1" style={{ color: COLOR.ink, fontSize: 26, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
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
 * The button, then the same link as small plain text for clients that block buttons. The text
 * link is left out of the plain-text version, where the button already prints the URL.
 */
export function EmailAction({ label, url }) {
    return (
        <>
            <Section style={{ margin: "24px 0 12px" }}>
                <Button
                    href={url}
                    style={{ backgroundColor: COLOR.brand, borderRadius: 8, color: "#FFFFFF", fontSize: 16, fontWeight: 600, padding: "14px 28px", textDecoration: "none", display: "inline-block" }}
                >
                    {label}
                </Button>
            </Section>
            <Text data-skip-in-text="true" style={{ ...smallText, margin: "0 0 16px" }}>
                Button not working? Paste this link into your browser:{" "}
                <Link href={url} style={{ color: COLOR.brand, wordBreak: "break-all", overflowWrap: "anywhere" }}>
                    {url}
                </Link>
            </Text>
        </>
    );
}

/** Consequence or deadline: one flat amber field, the only filled block in a mail. */
export function EmailNotice({ children }) {
    return (
        <Section style={{ backgroundColor: COLOR.warningSoft, borderRadius: 8, margin: "20px 0" }}>
            <Row>
                <Column style={{ padding: "14px 16px" }}>{children}</Column>
            </Row>
        </Section>
    );
}

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

/** The circuit brain mark and the `_CodeDev;` wordmark: the only brand element in a mail. */
export default function EmailBrandBadge({ baseUrl = null }) {
    const origin = baseUrl || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const logoUrl = `${String(origin).replace(/\/+$/, "")}/image/static/logo.png`;

    return (
        <Section style={{ marginBottom: "28px" }}>
            <table cellPadding="0" cellSpacing="0" border="0" style={{ borderCollapse: "collapse" }}>
                <tbody>
                    <tr>
                        <td style={{ verticalAlign: "middle", paddingRight: "12px", width: "36px" }}>
                            {/* alt="": the wordmark next to it already says CodeDev. */}
                            <Img
                                src={logoUrl}
                                width="36"
                                height="36"
                                alt=""
                                style={{
                                    display: "block",
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "8px",
                                    // The PNG is transparent: a solid plate keeps it visible when a client darkens the mail.
                                    backgroundColor: COLOR.card,
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
                                <span style={{ color: COLOR.brand }}>CodeDev</span>
                                <span style={{ color: "#DB2777" }}>;</span>
                            </Text>
                        </td>
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
        <Section style={{ marginTop: "32px", borderTop: `1px solid ${COLOR.border}`, paddingTop: "20px" }}>
            <Text style={{ ...smallText, fontSize: 12, lineHeight: "18px", margin: 0 }}>
                © {new Date().getFullYear()} CodeDev, interactive developer courses.
            </Text>
        </Section>
    );
}
