'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { userQueries } from "@/queries/user.query";
import { userKeys } from "@/keys/user.keys";
import { validate } from "@/lib/validate";
import { UpdateInfoSchema } from "@/lib/definition";
import { uploadImageAction } from "@/actions/upload.actions";
import { updateUserProfileAction } from "@/actions/user.actions";
import { callWithAuthRetry } from "@/lib/actionResult";

import { ErrorReload } from "@/components/ui/error";
import SessionsSection from "@/components/settings/sessionsSection";
import { InputGroup, TextAreaGroup } from "@/components/ui/input";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { FieldGroup } from "@/components/shadcn/field";
import { Skeleton } from "@/components/shadcn/skeleton";

import {
    LuAtSign,
    LuCircleAlert,
    LuCircleCheck,
    LuImageUp,
    LuLoaderCircle,
    LuMail,
    LuPhone,
    LuSave,
    LuUser,
    LuX,
} from "react-icons/lu";

const PERSONAL_FIELDS = ['surname', 'name', 'nickname', 'phone', 'bio'];
const ACCOUNT_FIELDS = ['email'];

function initials(name = '') {
    const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
    return (parts[0]?.[0] || 'U').concat(parts[1]?.[0] || '').toUpperCase();
}

function pick(data, fields) {
    return fields.reduce((acc, key) => {
        acc[key] = data?.[key] ?? '';
        return acc;
    }, {});
}

// Only fields the user actually changed are validated and sent, so an empty
// optional value stored on the account never blocks saving another field.
function diff(values, data, fields) {
    return fields.reduce((acc, key) => {
        if ((values[key] ?? '') !== (data?.[key] ?? '')) {
            acc[key] = values[key];
        }
        return acc;
    }, {});
}

function fieldErrors(values, changed) {
    const { errors } = validate(UpdateInfoSchema, values);
    return Object.keys(changed).reduce((acc, key) => {
        if (errors?.[key]) acc[key] = errors[key];
        return acc;
    }, {});
}

function SettingsSection({ id, title, description, children }) {
    return (
        <section
            aria-labelledby={`${id}-heading`}
            className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8"
        >
            <div className="space-y-1">
                <h2 id={`${id}-heading`} className="text-base font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="min-w-0 rounded-lg border bg-card">{children}</div>
        </section>
    );
}

function SectionFooter({ hint, pending, disabled, label, pendingLabel, onReset, canReset }) {
    return (
        <div className="flex flex-col-reverse gap-3 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{hint}</p>
            <div className="flex justify-end gap-2">
                {canReset && (
                    <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={pending}>
                        Discard
                    </Button>
                )}
                <Button type="submit" size="sm" disabled={disabled || pending}>
                    {pending ? <LuLoaderCircle className="animate-spin" /> : <LuSave />}
                    {pending ? pendingLabel : label}
                </Button>
            </div>
        </div>
    );
}

function PhotoSection({ data, onSaved }) {
    const { showAlert: alert } = useApp();
    const inputRef = useRef(null);

    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [pending, setPending] = useState(false);

    useEffect(() => () => {
        if (preview) URL.revokeObjectURL(preview);
    }, [preview]);

    const displayName = [data?.surname, data?.name].filter(Boolean).join(' ') || data?.username || '';

    const clearSelection = () => {
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    const handlePick = (e) => {
        const next = e.target.files?.[0];
        if (!next) {
            clearSelection();
            return;
        }
        if (!next.type?.startsWith('image/')) {
            alert(400, 'Choose an image file (PNG, JPG, WebP or GIF).');
            e.target.value = '';
            return;
        }
        setFile(next);
        setPreview(URL.createObjectURL(next));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || pending) return;

        setPending(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'uploads');

            const uploadResponse = await callWithAuthRetry(() => uploadImageAction(formData));
            if (!uploadResponse.success) {
                alert(uploadResponse.status || 400, uploadResponse.message || 'Failed to upload image, try again later');
                return;
            }

            const response = await callWithAuthRetry(() => updateUserProfileAction({ image: uploadResponse.data }));
            if (response.success) {
                alert(200, 'Your profile photo has been updated.');
                clearSelection();
                await onSaved();
            } else {
                alert(response.status || 500, response.message || 'Failed to update your profile photo');
            }
        } catch (err) {
            alert(err.response?.status || 500, err.response?.data?.message || 'Failed to update your profile photo');
        } finally {
            setPending(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <Avatar className="size-16 border">
                    <AvatarImage src={preview || data?.image || undefined} alt="" className="object-cover" />
                    <AvatarFallback className="bg-primary-soft text-base font-semibold text-primary-soft-foreground">
                        {initials(displayName)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col gap-2">
                    <input
                        ref={inputRef}
                        id="avatar-file"
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handlePick}
                        disabled={pending}
                        tabIndex={-1}
                        aria-hidden="true"
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => inputRef.current?.click()}
                            disabled={pending}
                        >
                            <LuImageUp />
                            {file ? 'Choose another image' : 'Choose image'}
                        </Button>
                        {file && (
                            <Button type="button" variant="ghost" size="sm" onClick={clearSelection} disabled={pending}>
                                <LuX />
                                Remove selection
                            </Button>
                        )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground" aria-live="polite">
                        {file ? `Selected: ${file.name}` : 'A square image of at least 400 x 400 px works best.'}
                    </p>
                </div>
            </div>
            <SectionFooter
                hint={file ? 'The preview shows how your new photo will look.' : 'Choose an image to enable saving.'}
                pending={pending}
                disabled={!file}
                label="Save photo"
                pendingLabel="Uploading..."
            />
        </form>
    );
}

// Shared form logic for the sections that edit text fields on the account.
function useProfileForm({ data, fields, onSaved, successMessage }) {
    const { showAlert: alert } = useApp();

    const [draft, setDraft] = useState(null);
    const [errors, setErrors] = useState({});
    const [pending, setPending] = useState(false);

    const values = draft ?? pick(data, fields);
    const changed = diff(values, data, fields);
    const isDirty = Object.keys(changed).length > 0;
    const hasErrors = Object.keys(errors).length > 0;

    const handleChange = (e) => {
        const { name, value } = e.target;
        const next = { ...values, [name]: value };
        setDraft(next);

        const nextChanged = diff(next, data, fields);
        setErrors(fieldErrors({ ...pick(data, ['surname', 'name', 'email', 'phone']), ...next }, nextChanged));
    };

    const reset = () => {
        setDraft(null);
        setErrors({});
    };

    const resetField = (name) => {
        handleChange({ target: { name, value: '' } });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isDirty || pending) return;

        const nextErrors = fieldErrors({ ...pick(data, ['surname', 'name', 'email', 'phone']), ...values }, changed);
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            alert(400, 'Please check the form for errors before saving');
            return;
        }

        setPending(true);
        try {
            const response = await callWithAuthRetry(() => updateUserProfileAction(changed));
            if (response.success) {
                alert(200, successMessage);
                await onSaved();
                reset();
            } else {
                alert(response.status || 500, response.message || 'Failed to update your information');
            }
        } catch (err) {
            alert(err.response?.status || 500, err.response?.data?.message || 'Failed to update your information');
        } finally {
            setPending(false);
        }
    };

    return { values, errors, pending, isDirty, hasErrors, handleChange, handleSubmit, reset, resetField };
}

function PersonalSection({ data, onSaved }) {
    const form = useProfileForm({
        data,
        fields: PERSONAL_FIELDS,
        onSaved,
        successMessage: 'Your personal information has been updated.',
    });

    return (
        <form onSubmit={form.handleSubmit} noValidate>
            <FieldGroup className="gap-2.5 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <InputGroup
                        name="surname"
                        label="Surname"
                        value={form.values.surname}
                        onChange={form.handleChange}
                        error={form.errors.surname}
                        reset={form.resetField}
                        disabled={form.pending}
                        autoComplete="family-name"
                    />
                    <InputGroup
                        name="name"
                        label="Name"
                        value={form.values.name}
                        onChange={form.handleChange}
                        error={form.errors.name}
                        reset={form.resetField}
                        disabled={form.pending}
                        autoComplete="given-name"
                    />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <InputGroup
                        name="nickname"
                        label="Nickname"
                        value={form.values.nickname}
                        onChange={form.handleChange}
                        error={form.errors.nickname}
                        reset={form.resetField}
                        disabled={form.pending}
                        icon={<LuUser />}
                        autoComplete="nickname"
                        description="Shown next to your username in Contacts."
                    />
                    <InputGroup
                        name="phone"
                        label="Phone"
                        type="tel"
                        inputMode="numeric"
                        value={form.values.phone}
                        onChange={form.handleChange}
                        error={form.errors.phone}
                        reset={form.resetField}
                        disabled={form.pending}
                        icon={<LuPhone />}
                        autoComplete="tel"
                        description="10 digits, numbers only."
                    />
                </div>
                <TextAreaGroup
                    name="bio"
                    label="Bio"
                    rows={4}
                    placeholder="A sentence or two about what you are learning"
                    value={form.values.bio}
                    onChange={form.handleChange}
                    error={form.errors.bio}
                    disabled={form.pending}
                />
            </FieldGroup>
            <SectionFooter
                hint={form.isDirty ? 'You have unsaved changes.' : 'Your bio appears on your profile.'}
                pending={form.pending}
                disabled={!form.isDirty || form.hasErrors}
                label="Save changes"
                pendingLabel="Saving..."
                canReset={form.isDirty}
                onReset={form.reset}
            />
        </form>
    );
}

function AccountSection({ data, onSaved }) {
    const form = useProfileForm({
        data,
        fields: ACCOUNT_FIELDS,
        onSaved,
        successMessage: 'Your email address has been updated.',
    });

    return (
        <form onSubmit={form.handleSubmit} noValidate>
            <FieldGroup className="gap-2.5 p-4">
                <InputGroup
                    name="username"
                    label="Username"
                    value={data?.username ?? ''}
                    onChange={() => {}}
                    icon={<LuAtSign />}
                    disabled
                    description="Usernames cannot be changed."
                />
                <InputGroup
                    name="email"
                    label="Email"
                    type="email"
                    value={form.values.email}
                    onChange={form.handleChange}
                    error={form.errors.email}
                    reset={form.resetField}
                    disabled={form.pending}
                    icon={<LuMail />}
                    autoComplete="email"
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Status</span>
                    {data?.email_verified ? (
                        <Badge variant="success"><LuCircleCheck aria-hidden="true" />Verified</Badge>
                    ) : (
                        <Badge variant="warning"><LuCircleAlert aria-hidden="true" />Not verified</Badge>
                    )}
                </div>
            </FieldGroup>
            <SectionFooter
                hint="We use this address for sign in and account notices."
                pending={form.pending}
                disabled={!form.isDirty || form.hasErrors}
                label="Update email"
                pendingLabel="Updating..."
                canReset={form.isDirty}
                onReset={form.reset}
            />
        </form>
    );
}

function SettingsSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading settings">
            {[140, 320, 200].map((height, index) => (
                <div
                    key={height}
                    className={`grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8 ${index ? 'border-t pt-6' : ''}`}
                >
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-48 max-w-full" />
                    </div>
                    <Skeleton className="w-full rounded-lg" style={{ height }} />
                </div>
            ))}
        </div>
    );
}

export default function SettingsPage() {
    const { status } = useSession();
    const queryClient = useQueryClient();

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.me(status));

    const showLoading = status === 'loading' || (status === 'authenticated' && isLoading);

    const handleSaved = () => queryClient.invalidateQueries({ queryKey: userKeys.me() });

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Settings</h1>
                    <p className="max-w-[60ch] text-sm text-muted-foreground">
                        Update your profile photo, personal details and the email on your account.
                    </p>
                </div>
                <Button asChild variant="outline" className="self-start sm:self-auto">
                    <Link href="/profile"><LuUser />View profile</Link>
                </Button>
            </header>

            {showLoading ? (
                <SettingsSkeleton />
            ) : isError ? (
                <ErrorReload data={error} refetch={refetch} title="Could not load your settings" />
            ) : status !== 'authenticated' ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
                    <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <LuUser className="size-5" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <h2 className="text-sm font-semibold">Sign in to manage your settings</h2>
                        <p className="text-sm text-muted-foreground">Settings are saved to your CodeDev account.</p>
                    </div>
                    <Button asChild size="sm">
                        <Link href="/auth">Sign in</Link>
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    <SettingsSection
                        id="settings-photo"
                        title="Profile photo"
                        description="Shown on your profile, in the account menu and in Contacts."
                    >
                        <PhotoSection data={data} onSaved={handleSaved} />
                    </SettingsSection>

                    <SettingsSection
                        id="settings-personal"
                        title="Personal information"
                        description="Your name, nickname, phone number and bio."
                    >
                        {/* Keyed on the loaded record so drafts reset when fresh data arrives. */}
                        <PersonalSection key={data?.id || 'personal'} data={data} onSaved={handleSaved} />
                    </SettingsSection>

                    <SettingsSection
                        id="settings-account"
                        title="Account"
                        description="Your username and the email address used to sign in."
                    >
                        <AccountSection key={data?.id || 'account'} data={data} onSaved={handleSaved} />
                    </SettingsSection>

                    <SettingsSection
                        id="settings-sessions"
                        title="Active sessions"
                        description="Devices signed in to your account. Sign out any you do not recognise."
                    >
                        <SessionsSection />
                    </SettingsSection>
                </div>
            )}
        </div>
    );
}
