'use client'

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { commerceQueries } from "@/queries/premium.query";
import { cn } from "@/lib/utils";

import { ErrorReload } from "@/components/ui/error";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";

import { LuArrowRight, LuCoins, LuLibrary, LuLoaderCircle, LuReceipt } from "react-icons/lu";

import { ORDER_METHOD, ORDER_STATUS, formatDate, formatMoney, formatPoints, humanize } from "./format";

const TABS = ['orders', 'points'];

function SkeletonRows({ columns, rows = 5 }) {
    return Array.from({ length: rows }, (_, index) => (
        <TableRow key={index} className="hover:bg-transparent" aria-hidden="true">
            {Array.from({ length: columns }, (__, col) => (
                <TableCell key={col} className={col === 0 ? 'pl-4' : undefined}>
                    <Skeleton className={cn("h-4", col === 0 ? 'w-48 max-w-[40vw]' : 'w-20')} />
                </TableCell>
            ))}
        </TableRow>
    ));
}

function LoadMore({ hasNextPage, isFetchingNextPage, fetchNextPage, isError, label }) {
    if (isError) {
        return (
            <div className="flex justify-center py-3 text-sm text-muted-foreground" role="alert">
                <span className="flex items-center gap-2">
                    Could not load more {label}.
                    <Button variant="link" size="xs" onClick={() => fetchNextPage()}>Try again</Button>
                </span>
            </div>
        );
    }
    if (!hasNextPage) return null;
    return (
        <div className="flex justify-center py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </Button>
        </div>
    );
}

function orderAmount(order) {
    if (order.method === 'points') return formatPoints(order.points);
    return formatMoney(order.amountMinor, order.currency);
}

function OrderStatusBadge({ status }) {
    const meta = ORDER_STATUS[status] || { label: humanize(status) || 'Unknown', variant: 'muted' };
    return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function OrdersTab({ status }) {
    const query = useInfiniteQuery(commerceQueries.orders(status));
    const orders = query.data?.pages?.flatMap((page) => page?.orders || []) ?? [];
    const isLoading = query.isLoading || status === 'loading';

    if (!isLoading && query.isError && orders.length === 0) {
        return <ErrorReload data={query.error} refetch={() => query.refetch()} title="Could not load your orders" />;
    }

    if (!isLoading && orders.length === 0) {
        return (
            <Empty className="border border-dashed">
                <EmptyHeader>
                    <EmptyMedia variant="icon"><LuReceipt aria-hidden="true" /></EmptyMedia>
                    <EmptyTitle>No orders yet</EmptyTitle>
                    <EmptyDescription>Courses you buy or redeem with points will show up here.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button asChild size="sm">
                        <Link href="/course?price=paid"><LuLibrary aria-hidden="true" />Browse premium courses</Link>
                    </Button>
                </EmptyContent>
            </Empty>
        );
    }

    return (
        <div className="flex flex-col">
            <div className="overflow-hidden rounded-lg border">
                <Table aria-busy={isLoading}>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="pl-4">Course</TableHead>
                            <TableHead className="max-sm:hidden">Method</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="max-md:hidden">Date</TableHead>
                            <TableHead className="pr-4 text-right"><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <SkeletonRows columns={6} />
                        ) : orders.map((order) => (
                            <TableRow key={order.id}>
                                <TableCell className="max-w-0 pl-4 sm:w-full">
                                    <span className="block truncate font-medium" title={order.course?.title}>
                                        {order.course?.title || 'Course'}
                                    </span>
                                    <span className="block font-mono text-xs text-muted-foreground md:hidden">
                                        {formatDate(order.createdAt)}
                                    </span>
                                </TableCell>
                                <TableCell className="text-muted-foreground max-sm:hidden">
                                    {ORDER_METHOD[order.method] || humanize(order.method)}
                                </TableCell>
                                <TableCell className="font-mono tabular">{orderAmount(order)}</TableCell>
                                <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground tabular max-md:hidden">
                                    {formatDate(order.createdAt, { time: true })}
                                </TableCell>
                                <TableCell className="pr-4 text-right">
                                    <Button asChild variant="ghost" size="sm">
                                        <Link href={`/orders/${order.id}`} aria-label={`View order for ${order.course?.title || 'course'}`}>
                                            View
                                            <LuArrowRight aria-hidden="true" />
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <LoadMore
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                fetchNextPage={query.fetchNextPage}
                isError={query.isError && orders.length > 0}
                label="orders"
            />
        </div>
    );
}

function describeTransaction(tx) {
    const title = tx.course?.title;
    let text;
    switch (tx.type) {
        case 'spent':
            text = title ? `Redeemed ${title}` : 'Points spent';
            break;
        case 'refunded':
            text = title ? `Refund for ${title}` : 'Points refunded';
            break;
        case 'expired':
            text = 'Points expired';
            break;
        case 'adjusted':
            text = 'Balance adjustment';
            break;
        case 'earned':
        default:
            text = tx.source ? `Earned from ${humanize(tx.source).toLowerCase()}` : 'Points earned';
            if (title) text += ` in ${title}`;
    }
    return { text, reason: tx.reason || null };
}

function PointsTab({ status }) {
    const query = useInfiniteQuery(commerceQueries.wallet(status));
    const transactions = query.data?.pages?.flatMap((page) => page?.transactions || []) ?? [];
    const balance = query.data?.pages?.[0]?.balance;
    const isLoading = query.isLoading || status === 'loading';

    if (!isLoading && query.isError && transactions.length === 0) {
        return <ErrorReload data={query.error} refetch={() => query.refetch()} title="Could not load your points" />;
    }

    return (
        <div className="flex flex-col gap-4">
            <section aria-labelledby="balance-heading" className="flex items-center gap-3 rounded-lg border bg-card p-4">
                <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
                    <LuCoins className="size-5" aria-hidden="true" />
                </span>
                <div>
                    <h2 id="balance-heading" className="text-xs font-medium text-muted-foreground">Current balance</h2>
                    {isLoading ? (
                        <Skeleton className="mt-1 h-6 w-28" />
                    ) : (
                        <p className="font-mono text-xl font-semibold tabular">{formatPoints(balance)}</p>
                    )}
                </div>
            </section>

            {!isLoading && transactions.length === 0 ? (
                <Empty className="border border-dashed">
                    <EmptyHeader>
                        <EmptyMedia variant="icon"><LuCoins aria-hidden="true" /></EmptyMedia>
                        <EmptyTitle>No point activity yet</EmptyTitle>
                        <EmptyDescription>Complete lessons and challenges to earn points, then redeem them for premium courses.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="flex flex-col">
                    <div className="overflow-hidden rounded-lg border">
                        <Table aria-busy={isLoading}>
                            <caption className="sr-only">Point transactions, newest first</caption>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-4 max-sm:hidden">Date</TableHead>
                                    <TableHead className="max-sm:pl-4">Description</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="pr-4 text-right max-sm:hidden">Balance after</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <SkeletonRows columns={4} />
                                ) : transactions.map((tx) => {
                                    const credit = tx.direction === 'credit';
                                    const { text, reason } = describeTransaction(tx);
                                    return (
                                        <TableRow key={tx.id}>
                                            <TableCell className="pl-4 font-mono text-xs text-muted-foreground tabular max-sm:hidden">
                                                {formatDate(tx.createdAt, { time: true })}
                                            </TableCell>
                                            <TableCell className="max-w-0 w-full max-sm:pl-4">
                                                <span className="block truncate" title={text}>{text}</span>
                                                {reason && (
                                                    <span className="block truncate text-xs text-muted-foreground" title={reason}>{reason}</span>
                                                )}
                                                <span className="block font-mono text-xs text-muted-foreground sm:hidden">
                                                    {formatDate(tx.createdAt)}
                                                </span>
                                            </TableCell>
                                            <TableCell className={cn("text-right font-mono tabular", credit ? 'text-success' : 'text-foreground')}>
                                                <span className="sr-only">{credit ? 'Credit' : 'Debit'} </span>
                                                {credit ? '+' : '-'}{formatPoints(tx.amount)}
                                            </TableCell>
                                            <TableCell className="pr-4 text-right font-mono text-muted-foreground tabular max-sm:hidden">
                                                {tx.balanceAfter === null || tx.balanceAfter === undefined ? '-' : formatPoints(tx.balanceAfter)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <LoadMore
                        hasNextPage={query.hasNextPage}
                        isFetchingNextPage={query.isFetchingNextPage}
                        fetchNextPage={query.fetchNextPage}
                        isError={query.isError && transactions.length > 0}
                        label="transactions"
                    />
                </div>
            )}
        </div>
    );
}

export default function OrdersPage() {
    const { status } = useSession();
    const searchParams = useSearchParams();
    const requested = searchParams?.get('tab');
    const defaultTab = TABS.includes(requested) ? requested : 'orders';

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Orders and points
                </h1>
                <p className="max-w-[60ch] text-sm text-muted-foreground">
                    Review your course purchases and redemptions, and see how you earned and spent your points.
                </p>
            </header>

            <Tabs defaultValue={defaultTab} className="gap-4">
                <TabsList>
                    <TabsTrigger value="orders"><LuReceipt aria-hidden="true" />Orders</TabsTrigger>
                    <TabsTrigger value="points"><LuCoins aria-hidden="true" />Points</TabsTrigger>
                </TabsList>
                <TabsContent value="orders">
                    <OrdersTab status={status} />
                </TabsContent>
                <TabsContent value="points">
                    <PointsTab status={status} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
