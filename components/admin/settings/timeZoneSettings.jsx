'use client';

import { useId, useState } from "react";

import { AUTO_TIME_ZONE, deviceTimeZone, isTimeZone, offsetLabel, timeZoneOptions } from "@/lib/timeZone";
import { useAdminTimeZoneStore } from "@/stores/adminTimeZoneStore";
import { useApp } from "@/contexts/appContext";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";

const nowIn = (zone) => new Date().toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: zone });

/**
 * The zone admin screens show dates in and count days by (Overview "today", the activity chart): the
 * device's own zone by default, or one picked from the IANA list. Kept in this browser only.
 */
function TimeZoneForm({ Card }) {
    const id = useId();
    const { showAlert } = useApp();
    const choice = useAdminTimeZoneStore((s) => s.choice);
    const zone = useAdminTimeZoneStore((s) => s.zone);
    const setChoice = useAdminTimeZoneStore((s) => s.setChoice);
    // Mounted only in the browser once the store is ready (see the default export), so these read the device.
    const [device] = useState(deviceTimeZone);
    const [zones] = useState(timeZoneOptions);
    const [mode, setMode] = useState(choice === AUTO_TIME_ZONE ? "auto" : "custom");
    const [draft, setDraft] = useState(choice === AUTO_TIME_ZONE ? "" : choice);

    const draftValid = isTimeZone(draft.trim());
    const save = () => {
        if (mode === "auto") {
            setChoice(AUTO_TIME_ZONE);
            showAlert(200, `Following this device: ${deviceTimeZone()}`);
            return;
        }
        if (!draftValid) return;
        setChoice(draft.trim());
        showAlert(200, `Time zone set to ${draft.trim()}`);
    };
    const unchanged = mode === "auto" ? choice === AUTO_TIME_ZONE : draft.trim() === choice;

    return (
        <Card
            title="Time zone"
            description="Dates and times on the admin screens, and where a day starts for “today” and the Overview activity chart."
            footer="Saved in this browser only. Other admins and devices keep their own choice."
        >
            <p className="text-sm">
                In use: <span className="font-medium">{zone}</span> <span className="text-muted-foreground">({offsetLabel(zone)}) · now {nowIn(zone)}</span>
            </p>
            <RadioGroup value={mode} onValueChange={setMode} className="gap-3" aria-label="Time zone source">
                <label className="flex items-start gap-2 text-sm">
                    <RadioGroupItem value="auto" className="mt-0.5" />
                    <span>
                        Use this device&apos;s time zone
                        <span className="block text-xs text-muted-foreground">{device} ({offsetLabel(device)}), follows the device when it changes</span>
                    </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                    <RadioGroupItem value="custom" className="mt-0.5" />
                    <span>Choose a time zone</span>
                </label>
            </RadioGroup>
            {mode === "custom" && (
                <div className="grid max-w-md gap-1.5 pl-6">
                    <label htmlFor={`${id}-zone`} className="text-xs text-muted-foreground">IANA name, for example Asia/Ho_Chi_Minh or UTC</label>
                    <Input
                        id={`${id}-zone`}
                        list={`${id}-zones`}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && save()}
                        placeholder="Start typing a city or region"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={draft.trim() !== "" && !draftValid}
                        aria-describedby={`${id}-hint`}
                    />
                    <datalist id={`${id}-zones`}>
                        {zones.map((name) => <option key={name} value={name} />)}
                    </datalist>
                    <p id={`${id}-hint`} className="text-xs text-muted-foreground" aria-live="polite">
                        {draft.trim() === "" ? `${zones.length || "Every"} zones available.` : draftValid ? `${offsetLabel(draft.trim())} · now ${nowIn(draft.trim())}` : "Not a known time zone."}
                    </p>
                </div>
            )}
            <div>
                <Button size="sm" onClick={save} disabled={unchanged || (mode === "custom" && !draftValid)}>Save</Button>
            </div>
        </Card>
    );
}

/** Waits for the admin shell to read the saved choice, so the server never renders a device's zone. */
export default function TimeZoneSettings({ Card }) {
    const ready = useAdminTimeZoneStore((s) => s.ready);
    return ready ? <TimeZoneForm Card={Card} /> : <Card title="Time zone" footer={null}><p className="text-sm text-muted-foreground">Reading this browser&apos;s setting…</p></Card>;
}
