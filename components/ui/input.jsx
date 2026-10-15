'use client';
import { useState } from "react";

import { LuEye, LuEyeOff, LuX } from "react-icons/lu";

import { Field, FieldError, FieldLabel } from "@/components/shadcn/field";
import {
    InputGroup as InputGroupRoot,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
    InputGroupTextarea,
} from "@/components/shadcn/input-group";

// App-level labelled field built on shadcn Field + InputGroup.
// The props match the original API so existing forms keep working.
export function InputGroup({
    name,
    label,
    type = "text",
    value,
    onChange,
    error,
    icon,
    reset,
    disabled,
    tabIndex = 0,
    isPassword = false,
    inputMode,
    onBlur,
    onFocus,
    placeholder,
    autoComplete = "off",
    description,
}) {
    const [shown, setShown] = useState(false);
    const errorId = `${name}-error`;
    const canClear = !disabled && !isPassword && typeof reset === "function" && Boolean(value);

    return (
        <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <InputGroupRoot data-disabled={disabled ? true : undefined}>
                {icon && (
                    <InputGroupAddon aria-hidden="true">{icon}</InputGroupAddon>
                )}
                <InputGroupInput
                    id={name}
                    name={name}
                    type={isPassword && shown ? "text" : type}
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    onFocus={onFocus}
                    inputMode={inputMode}
                    autoComplete={autoComplete}
                    disabled={disabled}
                    tabIndex={tabIndex}
                    placeholder={placeholder}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                />
                {(canClear || isPassword) && (
                    <InputGroupAddon align="inline-end">
                        {canClear && (
                            <InputGroupButton
                                size="icon-xs"
                                onClick={() => reset(name)}
                                aria-label={`Clear ${label}`}
                            >
                                <LuX />
                            </InputGroupButton>
                        )}
                        {isPassword && (
                            <InputGroupButton
                                size="icon-xs"
                                onClick={() => setShown((prev) => !prev)}
                                aria-label={shown ? "Hide password" : "Show password"}
                                aria-pressed={shown}
                            >
                                {shown ? <LuEyeOff /> : <LuEye />}
                            </InputGroupButton>
                        )}
                    </InputGroupAddon>
                )}
            </InputGroupRoot>
            {description && !error && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {error && <FieldError id={errorId}>{error}</FieldError>}
        </Field>
    );
}

export function TextAreaGroup({
    label,
    name,
    value,
    onChange,
    rows = 4,
    cols,
    error,
    ref,
    placeholder,
    disabled,
    maxLength,
}) {
    const errorId = `${name}-error`;

    return (
        <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <InputGroupRoot data-disabled={disabled ? true : undefined}>
                <InputGroupTextarea
                    id={name}
                    name={name}
                    rows={rows}
                    cols={cols}
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    placeholder={placeholder}
                    disabled={disabled}
                    maxLength={maxLength}
                    className="min-h-24"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                />
                {maxLength && (
                    <InputGroupAddon align="block-end" className="justify-end font-mono text-xs tabular">
                        {String(value || "").length}/{maxLength}
                    </InputGroupAddon>
                )}
            </InputGroupRoot>
            {error && <FieldError id={errorId}>{error}</FieldError>}
        </Field>
    );
}
