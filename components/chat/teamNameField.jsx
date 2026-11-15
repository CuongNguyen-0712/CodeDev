'use client'

import { useId } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/shadcn/field";
import { InputGroup, InputGroupInput } from "@/components/shadcn/input-group";

export const TEAM_NAME_MAX = 20;

/** The team name input with its always-visible N/20 counter (code points, as teamNameSchema counts); shared by New team and Rename. */
export default function TeamNameField({ value, onChange, error, disabled }) {
    const id = useId();
    return (
        <Field data-invalid={Boolean(error) || undefined}>
            <FieldLabel htmlFor={`${id}-name`}>Team name</FieldLabel>
            <InputGroup>
                <InputGroupInput
                    id={`${id}-name`}
                    value={value}
                    maxLength={TEAM_NAME_MAX}
                    autoComplete="off"
                    disabled={disabled}
                    aria-invalid={Boolean(error) || undefined}
                    aria-describedby={error ? `${id}-count ${id}-error` : `${id}-count`}
                    onChange={(event) => onChange(event.target.value)}
                />
            </InputGroup>
            {/* Counter first, so it does not move when an error appears under it. */}
            <FieldDescription id={`${id}-count`} className="tabular-nums">{[...value].length}/{TEAM_NAME_MAX}</FieldDescription>
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </Field>
    );
}
