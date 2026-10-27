'use client';

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { adminQueries } from "@/queries/premium.query";
import {
    useAdminPublish, useAdminRemoveOffer, useAdminSetOffer, useAdminUpdateCourse,
} from "@/mutations/premium.mutation";

import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { ErrorReload } from "@/components/ui/error";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";

import { LuPencil } from "react-icons/lu";

const STATUS_VARIANT = { published: "success", draft: "muted", unpublished: "warning", archived: "destructive" };
const LEVELS = ["beginner", "intermediate", "advanced", "expert", "master"];
const MINOR_DIGITS = { VND: 0, JPY: 0, KRW: 0 };

export function formatMoney(amountMinor, currency) {
    const digits = MINOR_DIGITS[currency] ?? 2;
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
            .format(amountMinor / 10 ** digits);
    } catch {
        return `${amountMinor} ${currency}`;
    }
}

function PriceSummary({ offers = [] }) {
    if (!offers.length) return <span className="text-muted-foreground">-</span>;
    return (
        <div className="flex flex-col gap-0.5 text-sm">
            {offers.map((offer) => (
                <span key={offer.priceType} className="font-mono tabular-nums">
                    {offer.priceType === "money" ? formatMoney(offer.amount, offer.currency) : `${offer.amount.toLocaleString()} pts`}
                </span>
            ))}
        </div>
    );
}

export default function CourseAdmin({ can }) {
    const { data, isPending, isError, refetch } = useQuery(adminQueries.courses());
    const [editingId, setEditingId] = useState(null);

    const courses = data?.courses || [];
    const editing = courses.find((course) => course.id === editingId) || null;

    if (isPending) {
        return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
    }
    if (isError) return <ErrorReload refetch={refetch} />;

    return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Course</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Access</TableHead>
                        <TableHead>Prices</TableHead>
                        <TableHead className="text-right">Learners</TableHead>
                        <TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {courses.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No courses yet.</TableCell></TableRow>
                    )}
                    {courses.map((course) => (
                        <TableRow key={course.id}>
                            <TableCell className="max-w-72">
                                <p className="truncate font-medium">{course.title}</p>
                                <p className="truncate font-mono text-xs text-muted-foreground">{course.id}</p>
                            </TableCell>
                            <TableCell><Badge variant={STATUS_VARIANT[course.publishStatus] || "muted"}>{course.publishStatus}</Badge></TableCell>
                            <TableCell><Badge variant={course.accessModel === "premium" ? "primary" : "info"}>{course.accessModel}</Badge></TableCell>
                            <TableCell><PriceSummary offers={course.offers} /></TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{course.students}</TableCell>
                            <TableCell className="text-right">
                                <Button size="sm" variant="outline" onClick={() => setEditingId(course.id)}>
                                    <LuPencil aria-hidden="true" /> Manage
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditingId(null)}>
                {editing && (
                    <CourseEditor
                        key={`${editing.id}:${editing.updatedAt}`}
                        course={editing}
                        courses={courses}
                        taxonomy={data.taxonomy}
                        can={can}
                    />
                )}
            </Dialog>
        </>
    );
}

function CheckboxList({ legend, items, selected, onChange, disabled }) {
    return (
        <fieldset className="space-y-2" disabled={disabled}>
            <legend className="text-sm font-medium">{legend}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((item) => {
                    const id = `${legend}-${item.code}`;
                    return (
                        <label key={item.code} htmlFor={id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                                id={id}
                                checked={selected.includes(item.code)}
                                onCheckedChange={(checked) => onChange(checked
                                    ? [...selected, item.code]
                                    : selected.filter((code) => code !== item.code))}
                            />
                            {item.name}
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

function SimpleSelect({ id, label, value, options, onChange, disabled }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
                <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function CourseEditor({ course, courses, taxonomy, can }) {
    const { showAlert } = useApp();
    const update = useAdminUpdateCourse();
    const publish = useAdminPublish();
    const setOffer = useAdminSetOffer();
    const removeOffer = useAdminRemoveOffer();

    const [form, setForm] = useState(() => ({
        accessModel: course.accessModel,
        courseType: course.courseType,
        level: course.level,
        roleCodes: course.roleCodes || [],
        industryCodes: course.industryCodes || [],
        goalCodes: course.goalCodes || [],
        prerequisiteIds: course.prerequisiteIds || [],
        skillWeights: Object.fromEntries((course.skills || []).map((s) => [s.code, String(s.weight)])),
    }));
    const [status, setStatus] = useState(course.publishStatus);
    const moneyOffer = course.offers.find((o) => o.priceType === "money");
    const pointsOffer = course.offers.find((o) => o.priceType === "points");
    const [money, setMoney] = useState(moneyOffer ? String(moneyOffer.amount) : "");
    const [currency, setCurrency] = useState(moneyOffer?.currency || "VND");
    const [points, setPoints] = useState(pointsOffer ? String(pointsOffer.amount) : "");
    // { title, description, confirmLabel, run } while a destructive action waits for confirmation.
    const [pendingConfirm, setPendingConfirm] = useState(null);

    const otherCourses = useMemo(() => courses.filter((c) => c.id !== course.id && c.publishStatus !== "archived"), [courses, course.id]);
    const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
    const fail = (error) => showAlert(error?.status || 500, error?.message || "Request failed");
    const done = (message) => showAlert(200, message);

    const saveMetadata = () => {
        const skills = Object.entries(form.skillWeights)
            .filter(([, weight]) => Number(weight) > 0)
            .map(([code, weight]) => ({ code, weight: Number(weight) }));
        update.mutate(
            {
                courseId: course.id,
                accessModel: form.accessModel,
                courseType: form.courseType,
                level: form.level,
                roleCodes: form.roleCodes,
                industryCodes: form.industryCodes,
                goalCodes: form.goalCodes,
                prerequisiteIds: form.prerequisiteIds,
                skills,
            },
            { onSuccess: () => done("Course metadata saved"), onError: fail }
        );
    };

    const applyStatus = () => {
        if (status === course.publishStatus) return;
        const run = () => publish.mutate({ courseId: course.id, status }, { onSuccess: () => done(`Course is now ${status}`), onError: fail });
        if (status !== "archived") return run();
        setPendingConfirm({ title: "Archive this course?", description: "Learners lose access to archived courses.", confirmLabel: "Archive", run });
    };

    const savePrice = (priceType) => {
        const amount = Number.parseInt(priceType === "money" ? money : points, 10);
        if (!Number.isInteger(amount) || amount <= 0) {
            showAlert(400, "Enter a positive whole number");
            return;
        }
        setOffer.mutate(
            { courseId: course.id, priceType, amount, ...(priceType === "money" ? { currency } : {}) },
            { onSuccess: () => done("Price saved"), onError: fail }
        );
    };

    const dropPrice = (priceType) => {
        setPendingConfirm({
            title: `Remove the ${priceType} price?`,
            description: "Learners will no longer be able to buy the course this way.",
            confirmLabel: "Remove price",
            run: () => removeOffer.mutate({ courseId: course.id, priceType }, { onSuccess: () => done("Price removed"), onError: fail }),
        });
    };

    const busy = update.isPending || publish.isPending || setOffer.isPending || removeOffer.isPending;
    const canEdit = can("course.update");

    return (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
                <DialogTitle>{course.title}</DialogTitle>
                <DialogDescription>Metadata drives recommendations and catalog filters. Prices are always read by the server.</DialogDescription>
            </DialogHeader>

            {can("course.publish") && (
                <section className="space-y-2 rounded-lg border border-border p-4" aria-labelledby="publish-heading">
                    <h3 id="publish-heading" className="text-sm font-semibold">Publishing</h3>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="w-48">
                            <SimpleSelect
                                id="publish-status"
                                label="Status"
                                value={status}
                                onChange={setStatus}
                                disabled={busy}
                                options={["draft", "published", "unpublished", "archived"].map((v) => ({ value: v, label: v }))}
                            />
                        </div>
                        <Button onClick={applyStatus} disabled={busy || status === course.publishStatus}>Apply</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Unpublished: hidden from the catalog, existing owners keep access. Archived: nobody can open it.
                    </p>
                </section>
            )}

            {can("course.price") && (
                <section className="space-y-3 rounded-lg border border-border p-4" aria-labelledby="price-heading">
                    <h3 id="price-heading" className="text-sm font-semibold">Prices</h3>
                    {course.accessModel !== "premium" ? (
                        <p className="text-sm text-muted-foreground">Free course: switch the access model to premium to set prices.</p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="price-money">Money price (minor units)</Label>
                                    <Input id="price-money" inputMode="numeric" value={money} onChange={(e) => setMoney(e.target.value.replace(/\D/g, ""))} className="w-40" />
                                </div>
                                <div className="w-28">
                                    <SimpleSelect id="price-currency" label="Currency" value={currency} onChange={setCurrency} disabled={busy}
                                        options={["VND", "USD"].map((v) => ({ value: v, label: v }))} />
                                </div>
                                <Button onClick={() => savePrice("money")} disabled={busy || !money}>Save</Button>
                                {moneyOffer && <Button variant="outline" onClick={() => dropPrice("money")} disabled={busy}>Remove</Button>}
                                {money && <span className="text-sm text-muted-foreground">= {formatMoney(Number(money), currency)}</span>}
                            </div>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="price-points">Points price</Label>
                                    <Input id="price-points" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))} className="w-40" />
                                </div>
                                <Button onClick={() => savePrice("points")} disabled={busy || !points}>Save</Button>
                                {pointsOffer && <Button variant="outline" onClick={() => dropPrice("points")} disabled={busy}>Remove</Button>}
                            </div>
                        </>
                    )}
                </section>
            )}

            <section className="space-y-4 rounded-lg border border-border p-4" aria-labelledby="meta-heading">
                <h3 id="meta-heading" className="text-sm font-semibold">Metadata</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <SimpleSelect id="meta-access" label="Access model" value={form.accessModel} disabled={!canEdit || busy}
                        onChange={(v) => set({ accessModel: v })} options={[{ value: "free", label: "Free" }, { value: "premium", label: "Premium" }]} />
                    <SimpleSelect id="meta-type" label="Course type" value={form.courseType} disabled={!canEdit || busy}
                        onChange={(v) => set({ courseType: v })} options={["course", "project", "workshop"].map((v) => ({ value: v, label: v }))} />
                    <SimpleSelect id="meta-level" label="Difficulty" value={form.level} disabled={!canEdit || busy}
                        onChange={(v) => set({ level: v })} options={LEVELS.map((v) => ({ value: v, label: v }))} />
                </div>

                <CheckboxList legend="Target roles" items={taxonomy.roles} selected={form.roleCodes} disabled={!canEdit || busy}
                    onChange={(roleCodes) => set({ roleCodes })} />
                <CheckboxList legend="Industries (none = any industry)" items={taxonomy.industries} selected={form.industryCodes} disabled={!canEdit || busy}
                    onChange={(industryCodes) => set({ industryCodes })} />
                <CheckboxList legend="Learning goals" items={taxonomy.goals} selected={form.goalCodes} disabled={!canEdit || busy}
                    onChange={(goalCodes) => set({ goalCodes })} />
                <CheckboxList legend="Prerequisites" items={otherCourses.map((c) => ({ code: c.id, name: c.title }))} selected={form.prerequisiteIds}
                    disabled={!canEdit || busy} onChange={(prerequisiteIds) => set({ prerequisiteIds })} />

                <fieldset className="space-y-2" disabled={!canEdit || busy}>
                    <legend className="text-sm font-medium">Skills taught (0 = not taught, 5 = core)</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {taxonomy.skills.map((skill) => (
                            <label key={skill.code} className="flex items-center justify-between gap-2 text-sm">
                                <span>{skill.name}</span>
                                <select
                                    aria-label={`${skill.name} weight`}
                                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                    value={form.skillWeights[skill.code] || "0"}
                                    onChange={(e) => set({ skillWeights: { ...form.skillWeights, [skill.code]: e.target.value } })}
                                >
                                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </label>
                        ))}
                    </div>
                </fieldset>
            </section>

            <DialogFooter>
                {canEdit && <Button onClick={saveMetadata} disabled={busy}>{update.isPending ? "Saving..." : "Save metadata"}</Button>}
            </DialogFooter>

            <ConfirmDialog
                open={Boolean(pendingConfirm)}
                onOpenChange={(open) => !open && setPendingConfirm(null)}
                title={pendingConfirm?.title}
                description={pendingConfirm?.description}
                confirmLabel={pendingConfirm?.confirmLabel}
                onConfirm={() => pendingConfirm?.run()}
            />
        </DialogContent>
    );
}
