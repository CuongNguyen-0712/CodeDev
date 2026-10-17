'use client'

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { commerceQueries } from "@/queries/premium.query";
import { cn } from "@/lib/utils";

import { ErrorReload } from "@/components/ui/error";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import {
    LuArrowLeft,
    LuCircleCheck,
    LuCircleX,
    LuClock,
    LuCreditCard,
    LuExternalLink,
    LuLoaderCircle,
    LuReceipt,
    LuRotateCcw,
    LuUndo2,
} from "react-icons/lu";

import { ORDER_METHOD, ORDER_STATUS, formatDate, formatMoney, formatPoints, humanize, isSafeCheckoutUrl } from "./format";
import { StartLearningButton } from "./startLearningButton";

const STATE = {
    pending: {
        Icon: LuClock,
        title: 'Waiting for payment confirmation',
        text: 'We are waiting for the payment provider to confirm this order. This page updates automatically.',
        tone: 'warning',
    },
    completed: {
        Icon: LuCircleCheck,
        title: 'Payment confirmed',
        text: 'Your order is complete and the course is unlocked.',
        tone: 'success',
    },
    failed: {
        Icon: LuCircleX,
        title: 'Payment failed',
        text: 'The payment did not go through. You were not charged for this order.',
        tone: 'destructive',
    },
    cancelled: {
        Icon: LuCircleX,
        title: 'Payment cancelled',
        text: 'This order was cancelled before the payment completed.',
        tone: 'muted',
    },
    expired: {
        Icon: LuClock,
        title: 'Order expired',
        text: 'The payment was not completed in time, so this order expired.',
        tone: 'muted',
    },
    refunded: {
        Icon: LuUndo2,
        title: 'Order refunded',
        text: 'This order was refunded and access granted by it has been removed.',
        tone: 'info',
    },
};

const TONE = {
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
    destructive: 'bg-destructive-soft text-destructive',
    info: 'bg-info-soft text-info',
    muted: 'bg-muted text-muted-foreground',
};

function Detail({ label, value, mono = false }) {
    if (!value) return null;
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className={cn("text-right text-sm font-medium text-foreground", mono && "font-mono tabular")}>{value}</dd>
        </div>
    );
}

function OrderSkeleton() {
    return (
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-6" role="status" aria-label="Loading order">
            <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-md" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-64 max-w-full" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>
            </div>
            <Skeleton className="h-40 w-full" />
        </div>
    );
}

export default function OrderStatusPage({ orderId }) {
    const { status } = useSession();
    // Status always comes from the server (polled while pending); URL query params are ignored.
    const { data: order, isLoading, error, refetch, isFetching } = useQuery(commerceQueries.order(status, orderId));

    const loading = isLoading || status === 'loading';
    const state = order ? STATE[order.status] : null;
    const statusMeta = order ? (ORDER_STATUS[order.status] || { label: humanize(order.status), variant: 'muted' }) : null;
    const courseId = order?.course?.id;

    const amount = order
        ? order.method === 'points' ? formatPoints(order.points) : formatMoney(order.amountMinor, order.currency)
        : null;

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <div>
                <Button asChild variant="ghost" size="sm" className="-ml-2">
                    <Link href="/orders"><LuArrowLeft aria-hidden="true" />All orders</Link>
                </Button>
            </div>

            {loading ? (
                <OrderSkeleton />
            ) : error ? (
                <ErrorReload
                    data={error}
                    refetch={() => refetch()}
                    title={error?.status === 404 ? 'Order not found' : 'Could not load this order'}
                />
            ) : !order ? (
                <ErrorReload data={{ status: 404, message: 'This order does not exist or belongs to another account.' }} title="Order not found" />
            ) : (
                <article className="flex flex-col gap-5 rounded-lg border bg-card p-5 sm:p-6" aria-labelledby="order-status-title">
                    <div role="status" aria-live="polite" className="flex items-start gap-3">
                        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", TONE[state?.tone || 'muted'])}>
                            {state ? <state.Icon className="size-5" aria-hidden="true" /> : <LuReceipt className="size-5" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0 space-y-1">
                            <h1 id="order-status-title" className="text-xl font-semibold tracking-tight text-foreground">
                                {state?.title || `Order ${statusMeta.label.toLowerCase()}`}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {order.status === 'completed' && order.accessGranted === false
                                    ? 'Your order is complete. Course access is being set up and will appear shortly.'
                                    : state?.text}
                            </p>
                            {order.status === 'pending' && (
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <LuLoaderCircle className={cn("size-3.5", isFetching && "animate-spin")} aria-hidden="true" />
                                    Checking every few seconds
                                </p>
                            )}
                            {order.failureReason && order.status !== 'completed' && (
                                <p className="text-sm text-muted-foreground">Reason: {humanize(order.failureReason)}</p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-md border p-3">
                        {order.course?.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={order.course.image} alt="" width={48} height={48} className="size-12 shrink-0 rounded-md border object-cover" />
                        ) : (
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                                <LuReceipt className="size-5" aria-hidden="true" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Course</p>
                            {courseId ? (
                                <Link href={`/course/${courseId}`} className="block truncate font-medium hover:text-primary hover:underline hover:underline-offset-4">
                                    {order.course?.title || 'Course'}
                                </Link>
                            ) : (
                                <p className="truncate font-medium">{order.course?.title || 'Course'}</p>
                            )}
                        </div>
                    </div>

                    <dl className="divide-y rounded-md border">
                        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                            <dt className="text-sm text-muted-foreground">Status</dt>
                            <dd><Badge variant={statusMeta.variant}>{statusMeta.label}</Badge></dd>
                        </div>
                        <Detail label="Method" value={ORDER_METHOD[order.method] || humanize(order.method)} />
                        <Detail label="Amount" value={amount} mono />
                        <Detail label="Ordered" value={formatDate(order.createdAt, { time: true })} mono />
                        <Detail label="Paid" value={formatDate(order.paidAt, { time: true })} mono />
                        <Detail label="Failed" value={formatDate(order.failedAt, { time: true })} mono />
                        <Detail label="Cancelled" value={formatDate(order.cancelledAt, { time: true })} mono />
                        <Detail label="Refunded" value={formatDate(order.refundedAt, { time: true })} mono />
                        {order.status === 'pending' && (
                            <Detail label="Expires" value={formatDate(order.expiresAt, { time: true })} mono />
                        )}
                        <Detail label="Order ID" value={order.id} mono />
                    </dl>

                    <div className="flex flex-wrap items-center gap-2">
                        {order.status === 'pending' && isSafeCheckoutUrl(order.checkoutUrl) && (
                            <Button type="button" onClick={() => window.location.assign(order.checkoutUrl)}>
                                <LuCreditCard aria-hidden="true" />
                                Continue to payment
                                <LuExternalLink aria-hidden="true" />
                            </Button>
                        )}
                        {order.status === 'completed' && courseId && (
                            <>
                                <StartLearningButton courseId={courseId} />
                                <Button asChild variant="outline">
                                    <Link href={`/course/${courseId}`}>View course</Link>
                                </Button>
                            </>
                        )}
                        {['failed', 'cancelled', 'expired'].includes(order.status) && courseId && (
                            <Button asChild>
                                <Link href={`/course/${courseId}`}><LuRotateCcw aria-hidden="true" />Try again</Link>
                            </Button>
                        )}
                        {order.status === 'refunded' && courseId && (
                            <Button asChild variant="outline">
                                <Link href={`/course/${courseId}`}>View course</Link>
                            </Button>
                        )}
                        <Button asChild variant="ghost">
                            <Link href="/orders">All orders</Link>
                        </Button>
                    </div>
                </article>
            )}
        </div>
    );
}
