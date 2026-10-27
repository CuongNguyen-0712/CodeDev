'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { onboardingQueries } from "@/queries/premium.query";
import { useUpdatePreferences } from "@/mutations/premium.mutation";

import { ErrorReload } from "@/components/ui/error";
import { ChoiceCheckboxGroup, levelLabel, sameSet } from "@/components/onboarding/choiceFields";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/shadcn/field";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";

import { LuArrowRight, LuSave } from "react-icons/lu";

const NONE = "none";

const STATUS_COPY = {
    completed: { label: "Completed", variant: "success", text: "Your recommendations use the preferences below.", cta: null },
    in_progress: { label: "In progress", variant: "info", text: "You started onboarding but have not finished it.", cta: "Continue onboarding" },
    skipped: { label: "Skipped", variant: "warning", text: "Onboarding skipped. Finish it for better recommendations.", cta: "Finish onboarding" },
    not_started: { label: "Not started", variant: "muted", text: "Answer a few questions to personalise your recommendations.", cta: "Start onboarding" },
};

function fromPreferences(preferences) {
    return {
        roleCode: preferences?.roleCode ?? null,
        industryCodes: preferences?.industryCodes ?? [],
        experienceLevel: preferences?.experienceLevel ?? null,
        goalCodes: preferences?.goalCodes ?? [],
        preferredLanguageId: preferences?.preferredLanguageId ?? null,
    };
}

function diff(values, saved) {
    const changed = {};
    if (values.roleCode !== saved.roleCode) changed.roleCode = values.roleCode;
    if (values.experienceLevel !== saved.experienceLevel) changed.experienceLevel = values.experienceLevel;
    if (values.preferredLanguageId !== saved.preferredLanguageId) changed.preferredLanguageId = values.preferredLanguageId;
    if (!sameSet(values.industryCodes, saved.industryCodes)) changed.industryCodes = values.industryCodes;
    if (!sameSet(values.goalCodes, saved.goalCodes)) changed.goalCodes = values.goalCodes;
    return changed;
}

function SelectField({ id, label, value, onChange, disabled, noneLabel, options, description }) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)} disabled={disabled}>
                <SelectTrigger id={id} className="w-full" aria-describedby={description ? `${id}-description` : undefined}>
                    <SelectValue placeholder={noneLabel} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>{noneLabel}</SelectItem>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {description && (
                <FieldDescription id={`${id}-description`} className="text-xs">{description}</FieldDescription>
            )}
        </div>
    );
}

function PreferencesSkeleton() {
    return (
        <div className="flex flex-col gap-4 p-4" role="status" aria-busy="true" aria-label="Loading preferences">
            <Skeleton className="h-6 w-64 max-w-full" />
            <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
            </div>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
        </div>
    );
}

function PreferencesForm({ catalog, state }) {
    const { showAlert } = useApp();
    const update = useUpdatePreferences();

    const saved = useMemo(() => fromPreferences(state?.preferences), [state]);
    const [draft, setDraft] = useState(null);
    const values = draft ?? saved;
    const changed = diff(values, saved);
    const isDirty = Object.keys(changed).length > 0;
    const pending = update.isPending;

    const roleOptions = (catalog?.roles || []).map((role) => ({ value: role.code, label: role.name }));
    const levelOptions = (catalog?.levels || []).map((level) => ({ value: level, label: levelLabel(level) }));
    const languageOptions = (catalog?.languages || []).map((lang) => ({ value: String(lang.id), label: lang.name }));
    const industryOptions = (catalog?.industries || []).map((item) => ({ value: item.code, label: item.name }));
    const goalOptions = (catalog?.goals || []).map((goal) => ({ value: goal.code, label: goal.name }));

    const set = (patch) => setDraft({ ...values, ...patch });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isDirty || pending) return;
        try {
            await update.mutateAsync(changed);
            showAlert(200, "Your learning preferences have been updated.");
            setDraft(null);
        } catch (err) {
            // The draft is kept so the user can retry.
            showAlert(err?.status || 500, err?.message || "Failed to update your preferences");
        }
    };

    const copy = STATUS_COPY[state?.status] || STATUS_COPY.not_started;

    return (
        <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Onboarding</span>
                    <Badge variant={copy.variant}>{copy.label}</Badge>
                    <span className="text-muted-foreground">{copy.text}</span>
                </div>
                {copy.cta && (
                    <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
                        <Link href="/onboarding">
                            {copy.cta}
                            <LuArrowRight />
                        </Link>
                    </Button>
                )}
            </div>

            <FieldGroup className="gap-5 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                        id="preferences-role"
                        label="Role"
                        value={values.roleCode}
                        onChange={(roleCode) => set({ roleCode })}
                        disabled={pending}
                        noneLabel="No role selected"
                        options={roleOptions}
                    />
                    <SelectField
                        id="preferences-level"
                        label="Experience level"
                        value={values.experienceLevel}
                        onChange={(experienceLevel) => set({ experienceLevel })}
                        disabled={pending}
                        noneLabel="Not set"
                        options={levelOptions}
                    />
                </div>

                <SelectField
                    id="preferences-language"
                    label="Preferred programming language"
                    value={values.preferredLanguageId != null ? String(values.preferredLanguageId) : null}
                    onChange={(id) => set({ preferredLanguageId: id == null ? null : Number(id) })}
                    disabled={pending}
                    noneLabel="No preference"
                    options={languageOptions}
                    description="Used to rank recommendations: courses in this language appear first."
                />

                <FieldSet disabled={pending} className="gap-2">
                    <FieldLegend variant="label" className="mb-1">Industries</FieldLegend>
                    {industryOptions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No industries are available yet.</p>
                    ) : (
                        <ChoiceCheckboxGroup
                            idPrefix="preferences-industry"
                            options={industryOptions}
                            values={values.industryCodes}
                            onChange={(industryCodes) => set({ industryCodes })}
                            disabled={pending}
                        />
                    )}
                </FieldSet>

                <FieldSet disabled={pending} className="gap-2">
                    <FieldLegend variant="label" className="mb-1">Goals</FieldLegend>
                    {goalOptions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No goals are available yet.</p>
                    ) : (
                        <ChoiceCheckboxGroup
                            idPrefix="preferences-goal"
                            options={goalOptions}
                            values={values.goalCodes}
                            onChange={(goalCodes) => set({ goalCodes })}
                            disabled={pending}
                        />
                    )}
                </FieldSet>
            </FieldGroup>

            <div className="flex flex-col-reverse gap-3 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                    {isDirty ? "You have unsaved changes." : "Changes update your recommendations right away."}
                </p>
                <div className="flex justify-end gap-2">
                    {isDirty && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={pending}>
                            Discard
                        </Button>
                    )}
                    <Button type="submit" size="sm" disabled={!isDirty || pending}>
                        {pending ? <Spinner aria-hidden="true" /> : <LuSave />}
                        {pending ? "Saving..." : "Save preferences"}
                    </Button>
                </div>
            </div>
        </form>
    );
}

export default function PreferencesSection() {
    const { status } = useSession();

    const catalogQuery = useQuery(onboardingQueries.catalog());
    const stateQuery = useQuery(onboardingQueries.status(status));

    const loading = status === "loading" || catalogQuery.isLoading || (status === "authenticated" && stateQuery.isLoading);

    if (loading) return <PreferencesSkeleton />;

    if (!catalogQuery.data || !stateQuery.data) {
        return (
            <div className="p-4">
                <ErrorReload
                    compact
                    data={catalogQuery.error || stateQuery.error || { status: 500, message: "Could not load your preferences." }}
                    title="Could not load your preferences"
                    refetch={() => {
                        catalogQuery.refetch();
                        stateQuery.refetch();
                    }}
                />
            </div>
        );
    }

    return <PreferencesForm catalog={catalogQuery.data} state={stateQuery.data} />;
}
