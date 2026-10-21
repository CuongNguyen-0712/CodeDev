'use client'

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { commerceQueries } from "@/queries/premium.query";
import { newIdempotencyKey, useRedeemCourse } from "@/mutations/premium.mutation";
import { errorCode } from "@/clients/premium.client";

import { Button } from "@/components/shadcn/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/dialog";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuCircleCheck, LuCoins, LuLoaderCircle, LuRotateCw, LuTriangleAlert } from "react-icons/lu";

import { commerceErrorMessage, formatPoints } from "./format";
import { StartLearningButton } from "./startLearningButton";

function Row({ label, value, emphasis = false, tone }) {
    return (
        <div className="flex items-center justify-between gap-4 px-3 py-2">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className={[
                "text-sm tabular",
                emphasis ? "font-semibold text-foreground" : "font-medium text-foreground",
                tone === "danger" ? "text-destructive" : "",
            ].join(" ")}>
                {value}
            </dd>
        </div>
    );
}

function RedeemDialogContent({ courseId, courseTitle, points, onOpenChange }) {
    const { status } = useSession();

    // One key per opened dialog: a retry of the same intent replays instead of charging twice.
    const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

    const wallet = useInfiniteQuery(commerceQueries.wallet(status));
    const redeem = useRedeemCourse();

    const cost = Number(points) || 0;
    const balanceKnown = wallet.isSuccess && Number.isFinite(Number(wallet.data?.pages?.[0]?.balance));
    const balance = balanceKnown ? Number(wallet.data.pages[0].balance) : null;
    const missing = balanceKnown ? Math.max(0, cost - balance) : 0;
    const insufficient = balanceKnown && missing > 0;

    const result = redeem.data;
    const succeeded = redeem.isSuccess && result;
    const code = redeem.isError ? errorCode(redeem.error) : null;
    const pending = redeem.isPending;

    const canConfirm = balanceKnown && !insufficient && cost > 0 && !pending && !succeeded && code !== 'ALREADY_OWNED';

    const handleConfirm = () => {
        if (!canConfirm) return;
        redeem.mutate(
            { courseId, idempotencyKey },
            {
                onError: (error) => {
                    // The key was used for a different request: the next attempt is a new intent.
                    if (errorCode(error) === 'IDEMPOTENCY_CONFLICT') setIdempotencyKey(newIdempotencyKey());
                },
            }
        );
    };

    const blockClose = (event) => {
        if (pending) event.preventDefault();
    };

    return (
        <DialogContent
            showCloseButton={!pending}
            onEscapeKeyDown={blockClose}
            onInteractOutside={blockClose}
            className="sm:max-w-md"
        >
            <DialogHeader>
                <DialogTitle>{succeeded ? 'Course unlocked' : 'Redeem with points'}</DialogTitle>
                <DialogDescription>
                    {succeeded
                        ? `You can now start ${courseTitle || 'this course'}.`
                        : `Use your points to unlock ${courseTitle || 'this course'}. Points are deducted once the server confirms the redemption.`}
                </DialogDescription>
            </DialogHeader>

            {succeeded ? (
                <div role="status" aria-live="polite" className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 rounded-md border border-success/20 bg-success-soft px-3 py-2 text-sm text-success">
                        <LuCircleCheck className="size-4 shrink-0" aria-hidden="true" />
                        {result.replayed ? 'This redemption was already completed.' : 'Redemption complete.'}
                    </div>
                    <dl className="divide-y rounded-md border">
                        <Row label="Points spent" value={formatPoints(result.pointsSpent)} />
                        <Row label="New balance" value={formatPoints(result.balanceAfter)} emphasis />
                    </dl>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {wallet.isLoading ? (
                        <div className="space-y-2 rounded-md border p-3" role="status" aria-label="Loading your point balance">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                        </div>
                    ) : wallet.isError || !balanceKnown ? (
                        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/20 bg-destructive-soft/60 px-3 py-2 text-sm">
                            <span>Could not load your point balance.</span>
                            <Button type="button" variant="outline" size="xs" onClick={() => wallet.refetch()}>
                                <LuRotateCw aria-hidden="true" />
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <dl className="divide-y rounded-md border">
                            <Row label="Current balance" value={formatPoints(balance)} />
                            <Row label="Cost" value={`- ${formatPoints(cost)}`} />
                            <Row
                                label="Balance after"
                                value={insufficient ? 'Not enough points' : formatPoints(balance - cost)}
                                emphasis
                                tone={insufficient ? 'danger' : undefined}
                            />
                        </dl>
                    )}

                    {insufficient && (
                        <p className="flex items-start gap-2 text-sm text-warning" role="note">
                            <LuCoins className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            You need {formatPoints(missing)} more to redeem this course. Earn points by completing lessons and challenges.
                        </p>
                    )}

                    <div aria-live="assertive">
                        {redeem.isError && (
                            <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive-soft/60 px-3 py-2 text-sm text-destructive">
                                <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                {commerceErrorMessage(redeem.error, 'Could not redeem this course. Please try again.')}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <DialogFooter>
                {succeeded || code === 'ALREADY_OWNED' ? (
                    <>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Close</Button>
                        </DialogClose>
                        <StartLearningButton courseId={courseId} onStarted={() => onOpenChange(false)} />
                    </>
                ) : (
                    <>
                        <DialogClose asChild>
                            <Button type="button" variant="outline" disabled={pending}>Cancel</Button>
                        </DialogClose>
                        <Button type="button" onClick={handleConfirm} disabled={!canConfirm} aria-busy={pending}>
                            {pending ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <LuCoins aria-hidden="true" />}
                            {pending ? 'Redeeming...' : `Redeem for ${formatPoints(cost)}`}
                        </Button>
                    </>
                )}
            </DialogFooter>
        </DialogContent>
    );
}

/**
 * Confirmation dialog for redeeming a course with points. The content (and with it the
 * idempotency key and the mutation state) is created fresh every time the dialog opens.
 */
export function RedeemDialog({ open, onOpenChange, courseId, courseTitle, points }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && (
                <RedeemDialogContent
                    courseId={courseId}
                    courseTitle={courseTitle}
                    points={points}
                    onOpenChange={onOpenChange}
                />
            )}
        </Dialog>
    );
}

export default RedeemDialog;
