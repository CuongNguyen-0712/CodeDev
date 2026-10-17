'use client';
import { useState } from "react";

import { LuCircleAlert, LuEye, LuEyeOff, LuX } from "react-icons/lu";

import { Field, FieldError, FieldLabel } from "@/components/shadcn/field";
import {
    InputGroup as InputGroupRoot,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
    InputGroupTextarea,
} from "@/components/shadcn/input-group";

// App-level labelled field built on shadcn Field + InputGroup.
// Uses a reserved helper slot (min-h-4) to completely eliminate layout shifts when validating.
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
        <Field data-invalid={error ? true : undefined} className="group/field gap-1">
            <FieldLabel
                htmlFor={name}
                className="text-xs font-semibold text-foreground/90 transition-colors group-focus-within/field:text-primary group-data-[invalid=true]/field:text-destructive"
            >
                {label}
            </FieldLabel>
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
            {/* Reserved slot: compact 16px height eliminates shift without bloated spacing */}
            <div className="min-h-4 flex items-center text-[11px] leading-4">
                {error ? (
                    <FieldError
                        id={errorId}
                        className="flex items-center gap-1 font-medium text-[11px] leading-4 text-destructive animate-in fade-in-50 duration-150"
                    >
                        <LuCircleAlert className="size-3 shrink-0" aria-hidden="true" />
                        <span>{error}</span>
                    </FieldError>
                ) : description ? (
                    <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
                ) : null}
            </div>
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
        <Field data-invalid={error ? true : undefined} className="group/field gap-1">
            <FieldLabel
                htmlFor={name}
                className="text-xs font-semibold text-foreground/90 transition-colors group-focus-within/field:text-primary group-data-[invalid=true]/field:text-destructive"
            >
                {label}
            </FieldLabel>
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
            <div className="min-h-4 flex items-center text-[11px] leading-4">
                {error && (
                    <FieldError
                        id={errorId}
                        className="flex items-center gap-1 font-medium text-[11px] leading-4 text-destructive animate-in fade-in-50 duration-150"
                    >
                        <LuCircleAlert className="size-3 shrink-0" aria-hidden="true" />
                        <span>{error}</span>
                    </FieldError>
                )}
            </div>
        </Field>
    );
}
