import { Link, Text } from "@react-email/components";
import { BRAND, EmailAction, EmailLayout, bodyText } from "./emailBadge";

/**
 * Account messages (docs/email-verification-plan.md 10.8): the link confirmation (with a button)
 * and the "connected" / "disconnected" notices (no button). `lines` are plain paragraphs;
 * `noteAction` ({ label, url }) is a link after the note, e.g. "Not you?" to Settings.
 */
export default function AccountEmailTemplate({ preview, heading, lines = [], action = null, note = null, noteAction = null, baseUrl = null }) {
    return (
        <EmailLayout preview={preview} badge="Security" baseUrl={baseUrl} linkUrl={action?.url || noteAction?.url} heading={heading}>
            {lines.map((line, i) => (
                <Text key={i} style={{ ...bodyText, margin: "0 0 12px" }}>
                    {line}
                </Text>
            ))}

            {action && <EmailAction label={action.label} url={action.url} />}

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
        </EmailLayout>
    );
}
