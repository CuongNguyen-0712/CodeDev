import { Text } from "@react-email/components";
import { COLOR, EmailAction, EmailLayout, EmailNotice, bodyText, smallText } from "./emailBadge";

/**
 * "Verify your email" message (docs/email-verification-plan.md 6.6). Formatted dates add notices:
 * `lockDeadline` = end of the 7-day grace period, still ahead (12); `deadline` = deletion of a
 * never-verified account (11.2). With a deadline and no lockDeadline the account is locked already.
 */
export default function VerifyEmailTemplate({ name, email, url, hours = 24, lockDeadline = null, deadline = null, baseUrl = null }) {
    const notices = [];
    if (lockDeadline) notices.push(`Verify by ${lockDeadline} to keep using CodeDev. After that date, your account is locked until you verify.`);
    if (lockDeadline && deadline) notices.push(`If you never verify, we delete your account and all its data on ${deadline}.`);
    if (!lockDeadline && deadline) notices.push(`Your account is locked until you verify. Verify by ${deadline}, or we delete the account and all its data.`);

    // Reminders put the deadline where the inbox shows it first: preview and heading.
    let preview = `Confirm ${email} to finish setting up your CodeDev account.`;
    let heading = "Verify your email";
    if (lockDeadline) {
        preview = `Verify by ${lockDeadline} or your CodeDev account is locked.`;
        heading = `Verify your email by ${lockDeadline}`;
    } else if (deadline) {
        preview = `Your CodeDev account is locked. Verify by ${deadline} or we delete it.`;
        heading = `Verify by ${deadline} to keep your account`;
    }

    return (
        <EmailLayout preview={preview} baseUrl={baseUrl} linkUrl={url} heading={heading}>
            <Text style={{ ...bodyText, margin: "0 0 16px" }}>
                {`Hi ${name?.trim() || "there"}, confirm that ${email} is your email address for CodeDev.`}
            </Text>

            {notices.length > 0 && (
                <EmailNotice>
                    {notices.map((notice, i) => (
                        <Text key={i} style={{ color: COLOR.warning, fontSize: 14, lineHeight: "20px", fontWeight: i === 0 ? 600 : 400, margin: i === 0 ? 0 : "8px 0 0" }}>
                            {notice}
                        </Text>
                    ))}
                </EmailNotice>
            )}

            <EmailAction label="Verify email" url={url} />

            <Text style={{ ...smallText, margin: "16px 0 0" }}>
                {`This link expires in ${hours} ${hours === 1 ? "hour" : "hours"}. If it has expired, sign in and send a new one from the banner. If you did not create a CodeDev account, ignore this email.`}
            </Text>
        </EmailLayout>
    );
}
