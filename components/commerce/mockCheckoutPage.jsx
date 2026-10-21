'use client'

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { commerceQueries } from "@/queries/premium.query";
import { useMockPayment } from "@/mutations/premium.mutation";

import { ErrorReload } from "@/components/ui/error";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuCircleCheck, LuCircleX, LuFlaskConical, LuLoaderCircle, LuTriangleAlert, LuX } from "react-icons/lu";

import { commerceErrorMessage, formatMoney } from "./format";

const OUTCOMES = [
    { outcome: 'succeeded', label: 'Pay', pendingLabel: 'Paying...', Icon: LuCircleCheck, variant: 'default' },
    { outcome: 'failed', label: 'Fail', pendingLabel: 'Failing...', Icon: LuCircleX, variant: 'outline' },
    { outcome: 'cancelled', label: 'Cancel', pendingLabel: 'Cancelling...', Icon: LuX, variant: 'ghost' },
];

/**
 * DEVELOPMENT ONLY: stands in for the payment provider's hosted page. Each button asks the server
 * to play a signed provider webhook; the order page then shows whatever the server recorded.
 */
export default function MockCheckoutPage({ orderId }) {
    const router = useRouter();
    const { status } = useSession();
    const { data: order, isLoading, error, refetch } = useQuery(commerceQueries.order(status, orderId));
    const payment = useMockPayment();
    const [isNavigating, startTransition] = useTransition();

    const busy = payment.isPending || isNavigating;
    // The mock endpoint answers 404 whenever the mock provider is off (always in production).
    const disabled = payment.isError && payment.error?.status === 404;
    const loading = isLoading || status === 'loading';

    const submit = (outcome) => {
        if (busy || disabled) return;
        payment.mutate(
            { orderId, outcome },
            { onSuccess: () => startTransition(() => router.replace(`/orders/${orderId}`)) }
        );
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pt-10 pb-10 sm:px-6">
            <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning" role="note">
                <LuFlaskConical className="size-4 shrink-0" aria-hidden="true" />
                <span><strong className="font-semibold">Test payment (development only).</strong> No real money is charged.</span>
            </div>

            {loading ? (
                <div className="space-y-3 rounded-lg border bg-card p-6" role="status" aria-label="Loading order">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : error ? (
                <ErrorReload
                    data={error}
                    refetch={() => refetch()}
                    title={error?.status === 404 ? 'Order not found' : 'Could not load this order'}
                />
            ) : !order ? null : (
                <section aria-labelledby="mock-checkout-title" className="flex flex-col gap-5 rounded-lg border bg-card p-6">
                    <div className="space-y-1">
                        <h1 id="mock-checkout-title" className="text-xl font-semibold tracking-tight">Simulated checkout</h1>
                        <p className="text-sm text-muted-foreground">
                            Choose the result the test payment provider should report for this order.
                        </p>
                    </div>

                    <dl className="divide-y rounded-md border">
                        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                            <dt className="text-sm text-muted-foreground">Course</dt>
                            <dd className="truncate text-sm font-medium">{order.course?.title || 'Course'}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                            <dt className="text-sm text-muted-foreground">Amount</dt>
                            <dd className="text-sm font-medium tabular">{formatMoney(order.amountMinor, order.currency)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                            <dt className="text-sm text-muted-foreground">Order status</dt>
                            <dd><Badge variant={order.status === 'pending' ? 'warning' : 'muted'}>{order.status}</Badge></dd>
                        </div>
                    </dl>

                    {order.status !== 'pending' && (
                        <p className="text-sm text-muted-foreground">
                            This order is no longer pending.{' '}
                            <Link href={`/orders/${orderId}`} className="text-primary-ink underline-offset-4 hover:underline">View the order</Link>
                        </p>
                    )}

                    <div aria-live="assertive">
                        {payment.isError && (
                            <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive-soft/60 px-3 py-2 text-sm text-destructive">
                                <LuTriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                {disabled
                                    ? 'Test payments are disabled.'
                                    : commerceErrorMessage(payment.error, 'Could not complete the test payment.')}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {OUTCOMES.map(({ outcome, label, pendingLabel, Icon, variant }) => {
                            const active = payment.isPending && payment.variables?.outcome === outcome;
                            return (
                                <Button
                                    key={outcome}
                                    type="button"
                                    variant={variant}
                                    onClick={() => submit(outcome)}
                                    disabled={busy || disabled || order.status !== 'pending'}
                                    aria-busy={active}
                                >
                                    {active ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <Icon aria-hidden="true" />}
                                    {active ? pendingLabel : label}
                                </Button>
                            );
                        })}
                    </div>
                </section>
            )}
        </div>
    );
}
