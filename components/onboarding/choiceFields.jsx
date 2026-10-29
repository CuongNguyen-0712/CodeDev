'use client';

import { Checkbox } from "@/components/shadcn/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/shadcn/field";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { cn } from "@/lib/utils";

// Experience levels come from the catalog (a fixed enum); only the wording lives here.
const LEVEL_HINTS = {
    beginner: "New to programming or just getting started.",
    junior: "You can build small projects with some help.",
    intermediate: "You ship features on your own and want to go deeper.",
    advanced: "You design systems and look for specialised topics.",
};

export function levelLabel(level) {
    if (!level) return "";
    const text = String(level).replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function levelHint(level) {
    return LEVEL_HINTS[level] || null;
}

/** Same members regardless of order. */
export function sameSet(a = [], b = []) {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    return b.every((value) => set.has(value));
}

export function toggleValue(list, value, checked) {
    if (checked) return list.includes(value) ? list : [...list, value];
    return list.filter((item) => item !== value);
}

/**
 * Single choice rendered as selectable cards. `options` = [{ value, label, description? }].
 * The surrounding <fieldset>/<legend> names the group.
 */
export function ChoiceRadioGroup({ idPrefix, options, value, onChange, disabled, invalid, describedBy, columns = 2, dense = false }) {
    return (
        <RadioGroup
            value={value ?? ""}
            onValueChange={onChange}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn("grid auto-rows-fr gap-2", dense ? "grid-cols-2 lg:grid-cols-3" : cn(columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3"))}
        >
            {options.map((option) => {
                const id = `${idPrefix}-${option.value}`;
                return (
                    <FieldLabel key={option.value} htmlFor={id} className="w-full cursor-pointer">
                        <Field orientation="horizontal" className={dense ? "gap-2.5 p-2.5!" : "gap-3 p-3!"}>
                            <RadioGroupItem
                                value={option.value}
                                id={id}
                                aria-labelledby={`${id}-title`}
                                aria-describedby={option.description ? `${id}-desc` : undefined}
                            />
                            <FieldContent className="gap-1">
                                <FieldTitle id={`${id}-title`}>{option.label}</FieldTitle>
                                {option.description && (
                                    <FieldDescription id={`${id}-desc`} className="text-xs">{option.description}</FieldDescription>
                                )}
                            </FieldContent>
                        </Field>
                    </FieldLabel>
                );
            })}
        </RadioGroup>
    );
}

/** Multiple choice rendered as selectable cards with checkboxes. */
export function ChoiceCheckboxGroup({ idPrefix, options, values, onChange, disabled, invalid, describedBy, columns = 2, dense = false }) {
    return (
        <div
            data-slot="checkbox-group"
            aria-describedby={describedBy}
            className={cn("grid auto-rows-fr gap-2", dense ? "grid-cols-2 lg:grid-cols-3" : cn(columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3"))}
        >
            {options.map((option) => {
                const id = `${idPrefix}-${option.value}`;
                const checked = values.includes(option.value);
                return (
                    <FieldLabel key={option.value} htmlFor={id} className="w-full cursor-pointer">
                        <Field orientation="horizontal" className={dense ? "gap-2.5 p-2.5!" : "gap-3 p-3!"}>
                            <Checkbox
                                id={id}
                                checked={checked}
                                disabled={disabled}
                                aria-invalid={invalid || undefined}
                                aria-labelledby={`${id}-title`}
                                aria-describedby={option.description ? `${id}-desc` : undefined}
                                onCheckedChange={(next) => onChange(toggleValue(values, option.value, next === true))}
                            />
                            <FieldContent className="gap-1">
                                <FieldTitle id={`${id}-title`}>{option.label}</FieldTitle>
                                {option.description && (
                                    <FieldDescription id={`${id}-desc`} className="text-xs">{option.description}</FieldDescription>
                                )}
                            </FieldContent>
                        </Field>
                    </FieldLabel>
                );
            })}
        </div>
    );
}
