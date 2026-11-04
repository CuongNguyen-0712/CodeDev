'use client';

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { retryTransient } from "@/lib/queryTimes";
import { useAdminCreateAnnouncement } from "@/mutations/premium.mutation";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import PageHeader from "@/components/admin/shell/pageHeader";
import { formatNumber } from "@/components/admin/ui/format";
import { describeAudience } from "@/components/admin/announcements/announcementsPage";
import { NotificationItem } from "@/components/ui/notificationCenter";
import { Button } from "@/components/shadcn/button";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { Textarea } from "@/components/shadcn/textarea";

import { LuSend } from "react-icons/lu";

const AUDIENCES = [
    { value: "all", label: "Everyone" },
    { value: "role", label: "By role" },
    { value: "course", label: "Learners of a course" },
    { value: "users", label: "Specific users" },
];
const ROLES = [
    { code: "student", label: "Student" },
    { code: "user", label: "User" },
    { code: "instructor", label: "Instructor" },
    { code: "course_manager", label: "Course manager" },
    { code: "admin", label: "Admin" },
    { code: "super_admin", label: "Super admin" },
];
const LINK = /^\/(?![/\\])[^\s\\]*$/;
const DATETIME_CLASS = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

// datetime-local wants local time.
const localInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** The audience the form describes, or null while it is incomplete. */
function buildAudience({ type, roles, courseId, users }) {
    if (type === "all") return { type };
    if (type === "role") return roles.length ? { type, roles } : null;
    if (type === "course") return courseId.trim() ? { type, courseId: courseId.trim() } : null;
    const userIds = [...new Set(users.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean))];
    return userIds.length ? { type, userIds } : null;
}

/**
 * New announcement (announcement.send): title, message, in-site link, audience, now or later.
 * The preview is the learner's own inbox row; the count is asked of the server as the audience
 * changes. `?user=<id>` opens it as a direct message to that user (from the user page).
 */
export default function AnnouncementComposer() {
    const id = useId();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showAlert } = useApp();
    const create = useAdminCreateAnnouncement();

    const presetUser = searchParams?.get("user") || "";
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [link, setLink] = useState("");
    const [type, setType] = useState(presetUser ? "users" : "all");
    const [roles, setRoles] = useState(["student"]);
    const [courseId, setCourseId] = useState("");
    const [users, setUsers] = useState(presetUser);
    const [when, setWhen] = useState("now");
    const [sendAt, setSendAt] = useState("");
    const [minSendAt] = useState(() => localInput(new Date(Date.now() + 5 * 60 * 1000)));
    const [errors, setErrors] = useState({});
    const [confirming, setConfirming] = useState(false);

    // The count follows the audience once typing pauses.
    const audience = buildAudience({ type, roles, courseId, users });
    const audienceKey = JSON.stringify(audience);
    const [checked, setChecked] = useState(audienceKey);
    useEffect(() => {
        const timer = setTimeout(() => setChecked(audienceKey), 400);
        return () => clearTimeout(timer);
    }, [audienceKey]);
    const checkedAudience = JSON.parse(checked);
    const count = useQuery({
        queryKey: adminKeys.announcementAudience(checkedAudience),
        queryFn: () => adminClient.previewAnnouncement(checkedAudience),
        enabled: Boolean(checkedAudience),
        retry: retryTransient,
        staleTime: 15_000,
    });
    const recipients = count.data?.recipients;

    const validate = () => {
        const next = {};
        if (title.trim().length < 3) next.title = "Give a title of at least 3 characters.";
        if (body.trim().length < 3) next.body = "Write the message.";
        if (link.trim() && !LINK.test(link.trim())) next.link = "Use a path on this site, like /course/abc.";
        if (!audience) next.audience = type === "role" ? "Pick at least one role." : type === "course" ? "Enter the course id." : "Enter at least one username.";
        if (when === "later" && (!sendAt || new Date(sendAt) <= new Date())) next.sendAt = "Pick a time in the future.";
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const submit = (event) => {
        event.preventDefault();
        if (validate()) setConfirming(true);
    };

    const send = () => create.mutate(
        {
            title: title.trim(),
            body: body.trim(),
            link: link.trim(),
            audience,
            sendAt: when === "later" ? new Date(sendAt).toISOString() : null,
        },
        {
            onSuccess: (row) => {
                showAlert(200, row?.status === "scheduled" ? "Announcement scheduled" : "Announcement sent");
                router.push("/admin/announcements");
            },
            onError: (error) => showAlert(error?.status || 500, error?.message || "The announcement was not sent"),
        }
    );

    const toggleRole = (code, on) => setRoles((current) => (on ? [...new Set([...current, code])] : current.filter((value) => value !== code)));
    const fieldError = (key) => errors[key] && <FieldError id={`${id}-${key}-error`}>{errors[key]}</FieldError>;
    const countText = !audience ? "Complete the audience to see who receives it."
        : count.isFetching && recipients == null ? "Counting recipients…"
        : count.isError ? (count.error?.message || "Couldn't count the recipients.")
        : recipients != null ? `${formatNumber(recipients)} active learner${recipients === 1 ? "" : "s"} will receive it.` : "";

    return (
        <>
            <PageHeader
                title={presetUser ? "Message a user" : "New announcement"}
                description={recipients != null && audience ? `Reaches ${formatNumber(recipients)} active learner${recipients === 1 ? "" : "s"}` : "Pick who receives it"}
            />

            <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-6">
                    <Field data-invalid={Boolean(errors.title) || undefined}>
                        <FieldLabel htmlFor={`${id}-title`}>Title</FieldLabel>
                        <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} aria-invalid={Boolean(errors.title) || undefined} aria-describedby={errors.title ? `${id}-title-error` : undefined} />
                        {fieldError("title")}
                    </Field>

                    <Field data-invalid={Boolean(errors.body) || undefined}>
                        <FieldLabel htmlFor={`${id}-body`}>Message</FieldLabel>
                        <Textarea id={`${id}-body`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} className="h-28 resize-y" aria-invalid={Boolean(errors.body) || undefined} aria-describedby={`${id}-body-hint`} />
                        {errors.body ? <FieldError id={`${id}-body-hint`}>{errors.body}</FieldError> : <FieldDescription id={`${id}-body-hint`}>Plain text. {formatNumber(1000 - body.length)} characters left.</FieldDescription>}
                    </Field>

                    <Field data-invalid={Boolean(errors.link) || undefined}>
                        <FieldLabel htmlFor={`${id}-link`}>Link <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                        <Input id={`${id}-link`} value={link} onChange={(event) => setLink(event.target.value)} placeholder="/course/your-course" maxLength={500} aria-invalid={Boolean(errors.link) || undefined} aria-describedby={`${id}-link-hint`} />
                        {errors.link ? <FieldError id={`${id}-link-hint`}>{errors.link}</FieldError> : <FieldDescription id={`${id}-link-hint`}>A page on this site that opens when the learner clicks it.</FieldDescription>}
                    </Field>

                    <FieldSet data-invalid={Boolean(errors.audience) || undefined}>
                        <FieldLegend>Audience</FieldLegend>
                        <RadioGroup value={type} onValueChange={setType} className="gap-2" aria-describedby={errors.audience ? `${id}-audience-error` : undefined}>
                            {AUDIENCES.map((item) => (
                                <label key={item.value} className="flex items-center gap-2 text-sm">
                                    <RadioGroupItem value={item.value} />
                                    {item.label}
                                </label>
                            ))}
                        </RadioGroup>
                        {type === "role" && (
                            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Roles">
                                {ROLES.map((role) => (
                                    <label key={role.code} className="flex items-center gap-2 text-sm">
                                        <Checkbox checked={roles.includes(role.code)} onCheckedChange={(on) => toggleRole(role.code, on === true)} />
                                        {role.label}
                                    </label>
                                ))}
                            </div>
                        )}
                        {type === "course" && (
                            <Field>
                                <FieldLabel htmlFor={`${id}-course`}>Course id</FieldLabel>
                                <Input id={`${id}-course`} value={courseId} onChange={(event) => setCourseId(event.target.value)} placeholder="rust-basics" maxLength={64} />
                            </Field>
                        )}
                        {type === "users" && (
                            <Field>
                                <FieldLabel htmlFor={`${id}-users`}>Usernames</FieldLabel>
                                <Textarea id={`${id}-users`} value={users} onChange={(event) => setUsers(event.target.value)} className="h-20 resize-y font-mono text-sm" aria-describedby={`${id}-users-hint`} />
                                <FieldDescription id={`${id}-users-hint`}>Up to 100, separated by spaces, commas or lines. Public ids work too.</FieldDescription>
                            </Field>
                        )}
                        {fieldError("audience")}
                        <p className="text-sm text-muted-foreground" aria-live="polite">{countText}</p>
                    </FieldSet>

                    <FieldSet data-invalid={Boolean(errors.sendAt) || undefined}>
                        <FieldLegend>When</FieldLegend>
                        <RadioGroup value={when} onValueChange={setWhen} className="gap-2">
                            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="now" />Send now</label>
                            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="later" />Schedule</label>
                        </RadioGroup>
                        {when === "later" && (
                            <Field>
                                <FieldLabel htmlFor={`${id}-send-at`}>Send at</FieldLabel>
                                <input id={`${id}-send-at`} type="datetime-local" min={minSendAt} value={sendAt} onChange={(event) => setSendAt(event.target.value)} className={DATETIME_CLASS} aria-invalid={Boolean(errors.sendAt) || undefined} aria-describedby={errors.sendAt ? `${id}-sendAt-error` : undefined} />
                            </Field>
                        )}
                        {fieldError("sendAt")}
                    </FieldSet>

                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={create.isPending}>
                            <LuSend aria-hidden="true" />
                            {when === "later" ? "Schedule" : "Send"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push("/admin/announcements")}>Cancel</Button>
                    </div>
                </div>

                <aside className="space-y-2 lg:sticky lg:top-6 lg:self-start" aria-label="Preview">
                    <h2 className="text-sm font-semibold">Preview</h2>
                    <div className="overflow-hidden rounded-lg border border-border bg-popover">
                        <NotificationItem
                            preview
                            compact
                            item={{ id: "preview", kind: "announcement", title: title.trim() || "Title", message: body.trim() || "Your message appears here.", read: false, createdAt: new Date().toISOString() }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">As it appears in the notification bell.</p>
                </aside>
            </form>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                destructive={false}
                title={when === "later" ? "Schedule this announcement?" : "Send this announcement?"}
                description={`${describeAudience(audience)}: ${recipients != null ? `${formatNumber(recipients)} learner${recipients === 1 ? "" : "s"}` : "the count is not known yet"}. It cannot be edited once sent, only retracted.`}
                confirmLabel={when === "later" ? "Schedule" : "Send"}
                confirmPhrase={type === "all" ? "everyone" : undefined}
                onConfirm={send}
            />
        </>
    );
}
