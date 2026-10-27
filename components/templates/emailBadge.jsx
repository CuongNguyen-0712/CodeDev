import { Head, Img, Section, Text } from "@react-email/components";

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
                            <td style={{ verticalAlign: "middle", paddingLeft: "12px" }}>
                                <span
                                    style={{
                                        display: "inline-block",
                                        backgroundColor: "#f3e8ff",
                                        color: "#7C3AED",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        padding: "3px 9px",
                                        borderRadius: "9999px",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.5px",
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
 * Standard footer for CodeDev emails with subtle copyright notice and reassurance.
 */
export function EmailFooter() {
    return (
        <Section style={{ marginTop: "32px", borderTop: "1px solid #e5e7eb", paddingTop: "20px" }}>
            <Text style={{ color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: "0 0 4px" }}>
                CodeDev — Interactive developer learning platform.
            </Text>
            <Text style={{ color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: 0 }}>
                © {new Date().getFullYear()} CodeDev. If you did not expect this message, you can safely ignore it.
            </Text>
        </Section>
    );
}
