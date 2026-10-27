'use client'

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { commerceQueries } from "@/queries/premium.query";
import { invalidateOwnership, newIdempotencyKey, useCheckout } from "@/mutations/premium.mutation";
import { useCourseRegister } from "@/mutations/course.mutation";
import { errorCode } from "@/clients/premium.client";
import { useApp } from "@/contexts/appContext";
import { cn } from "@/lib/utils";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import {
    LuArrowRight,
    LuCoins,
    LuCreditCard,
    LuInfo,
    LuLoaderCircle,
    LuLogIn,
    LuPlay,
    LuPlus,
    LuRotateCcw,
    LuRotateCw,
} from "react-icons/lu";

import { commerceErrorMessage, formatMoney, formatPoints, isPremium, isSafeCheckoutUrl, offersOf } from "./format";
import { OwnershipBadge } from "./ownershipBadge";
import { RedeemDialog } from "./redeemDialog";
import { StartLearningButton } from "./startLearningButton";

// Enrolment statuses that mean "has a learning record to go back to".
const ENROLLED_ACTION = {
    enrolled: { label: 'Start learning', Icon: LuPlay },
    in_progress: { label: 'Continue learning', Icon: LuArrowRight },
    paused: { label: 'Resume learning', Icon: LuArrowRight },
    completed: { label: 'Review course', Icon: LuRotateCcw },
};

function Note({ children, tone = "muted", role = "note" }) {
    return (
        <p
            role={role}
            className={cn(
                "flex basis-full items-start gap-2 text-sm",
                tone === "warning" ? "text-warning" : "text-muted-foreground"
            )}
        >
            <LuInfo className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{children}</span>
        </p>
    );
}

/**
 * The right call to action for one course, decided only from server data:
 * guest -> sign in; free -> enroll / continue; premium owned -> start / continue;
 * premium not owned -> buy (gateway checkout) and / or redeem with points.
 * While ownership is unknown (loading or failed) nothing that implies ownership is shown.
 *
 * @param course     course details response (courseQueries.details) or undefined while loading
 * @param isLoading  details query loading
 * @param error      details query error
 * @param onRetry    refetch for the details query
 */
export function PurchaseActions({ courseId, course, isLoading = false, error = null, onRetry, className }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { status: authStatus } = useSession();
    const { showAlert } = useApp();

    const [redeemOpen, setRedeemOpen] = useState(false);
    const [checkoutNote, setCheckoutNote] = useState(null);
    const [isNavigating, startTransition] = useTransition();
    const checkoutKey = useRef(null);

    const register = useCourseRegister();
    const checkout = useCheckout();

    const premium = isPremium(course);
    const ownedFromDetails = typeof course?.owned === 'boolean' ? course.owned : null;

    // Fallback when the details response carries no ownership (e.g. fetched before sign-in).
    const entitlements = useQuery({
        ...commerceQueries.entitlements(authStatus),
        enabled: authStatus === 'authenticated' && premium && ownedFromDetails === null,
    });

    if (authStatus === 'loading') {
        return <Skeleton className={cn("h-9 w-44", className)} role="status" aria-label="Loading course actions" />;
    }

    if (authStatus !== 'authenticated') {
        return (
            <div className={cn("flex flex-wrap items-center gap-2", className)}>
                <Button asChild>
                    <Link href="/auth">
                        <LuLogIn aria-hidden="true" />
                        Sign in to enroll
                    </Link>
                </Button>
            </div>
        );
    }

    if (isLoading || (!course && !error)) {
        return <Skeleton className={cn("h-9 w-44", className)} role="status" aria-label="Loading course actions" />;
    }

    if (error || !course) {
        return (
            <div role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm text-muted-foreground", className)}>
                <span>Could not load purchase options.</span>
                {onRetry && (
                    <Button type="button" variant="outline" size="sm" onClick={() => onRetry()}>
                        <LuRotateCw aria-hidden="true" />
                        Retry
                    </Button>
                )}
            </div>
        );
    }

    let owned = ownedFromDetails;
    if (premium && owned === null) {
        if (entitlements.isLoading) {
            return <Skeleton className={cn("h-9 w-44", className)} aria-label="Checking course access" />;
        }
        if (!entitlements.isSuccess) {
            return (
                <div role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm text-muted-foreground", className)}>
                    <span>Could not check your access to this course.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => entitlements.refetch()}>
                        <LuRotateCw aria-hidden="true" />
                        Retry
                    </Button>
                </div>
            );
        }
        owned = (entitlements.data?.courseIds || []).map(String).includes(String(courseId));
    }

    const enrolment = ENROLLED_ACTION[course.status] || null;
    const listed = !course.publish_status || course.publish_status === 'published';
    const busy = register.isPending || isNavigating;

    const openLearning = () => startTransition(() => router.push(`/learning/${courseId}`));

    const enrolFree = async () => {
        if (busy) return;
        try {
            await register.mutateAsync(courseId);
            openLearning();
        } catch (err) {
            showAlert(err?.status || 500, commerceErrorMessage(err, 'An error occurred while registering for the course.'));
        }
    };

    const startCheckout = async () => {
        if (checkout.isPending) return;
        setCheckoutNote(null);
        // One key per purchase intent; a retry after a network error replays the same order.
        if (!checkoutKey.current) checkoutKey.current = newIdempotencyKey();
        try {
            const result = await checkout.mutateAsync({ courseId, idempotencyKey: checkoutKey.current });
            if (!isSafeCheckoutUrl(result?.checkoutUrl)) {
                if (result?.orderId) {
                    router.push(`/orders/${result.orderId}`);
                    return;
                }
                throw new Error('The payment page could not be opened.');
            }
            window.location.assign(result.checkoutUrl);
        } catch (err) {
            const code = errorCode(err);
            if (code === 'IDEMPOTENCY_CONFLICT') checkoutKey.current = null;
            if (code === 'ALREADY_OWNED' || code === 'OFFER_UNAVAILABLE' || code === 'COURSE_UNAVAILABLE') {
                invalidateOwnership(queryClient, courseId);
            }
            if (code === 'PAYMENTS_DISABLED') {
                setCheckoutNote(commerceErrorMessage(err));
                return;
            }
            showAlert(err?.status || 500, commerceErrorMessage(err, 'Could not start the checkout. Please try again.'));
        }
    };

    const { money, points } = offersOf(course);

    // Kept mounted across the owned / not-owned switch so the redemption result stays visible
    // after the details query refetches with `owned: true`.
    const redeemDialog = points ? (
        <RedeemDialog
            open={redeemOpen}
            onOpenChange={setRedeemOpen}
            courseId={courseId}
            courseTitle={course.title}
            points={points}
        />
    ) : null;

    // One stable tree: the dialog keeps its place (and state) whichever branch renders.
    const wrap = (body) => (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {body}
            {redeemDialog}
        </div>
    );

    // Free course (or premium course the learner owns): enrol / continue.
    if (!premium || owned) {
        return wrap(
            <>
                {premium && owned && <OwnershipBadge />}
                {enrolment ? (
                    <Button type="button" onClick={openLearning} disabled={busy} className="min-w-40">
                        {busy ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <enrolment.Icon aria-hidden="true" />}
                        {enrolment.label}
                    </Button>
                ) : premium ? (
                    <StartLearningButton courseId={courseId} className="min-w-40" />
                ) : (
                    <Button type="button" onClick={enrolFree} disabled={busy} className="min-w-40">
                        {busy ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <LuPlus aria-hidden="true" />}
                        {register.isPending ? 'Enrolling...' : 'Enroll for free'}
                    </Button>
                )}
                {premium && owned && !listed && (
                    <Note>This course is no longer listed. You keep access.</Note>
                )}
            </>
        );
    }

    // Premium, not owned.
    if (!listed) {
        return wrap(<Note>This course is not available for purchase right now.</Note>);
    }

    if (!money && !points) {
        return wrap(<Note>This premium course is not on sale right now.</Note>);
    }

    return wrap(
        <>
            {money && (
                <Button
                    type="button"
                    onClick={startCheckout}
                    disabled={checkout.isPending || Boolean(checkoutNote)}
                    aria-busy={checkout.isPending}
                    className="min-w-40"
                >
                    {checkout.isPending ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <LuCreditCard aria-hidden="true" />}
                    {checkout.isPending ? 'Opening checkout...' : `Buy for ${formatMoney(money.amountMinor, money.currency)}`}
                </Button>
            )}
            {points && (
                <Button
                    type="button"
                    variant={money ? 'outline' : 'default'}
                    onClick={() => setRedeemOpen(true)}
                    className={money ? undefined : 'min-w-40'}
                >
                    <LuCoins aria-hidden="true" />
                    Redeem for {formatPoints(points)}
                </Button>
            )}
            <div aria-live="polite" className="basis-full empty:hidden">
                {checkoutNote && <Note tone="warning" role="status">{checkoutNote}</Note>}
            </div>
        </>
    );
}

export default PurchaseActions;
