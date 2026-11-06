'use client';

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { useAdmin } from "@/components/admin/adminContext";
import { adminQueries } from "@/queries/premium.query";
import { useAdminRefund } from "@/mutations/premium.mutation";

import { formatMoney } from "@/components/admin/courseAdmin";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { ErrorReload } from "@/components/ui/error";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import RowAction from "@/components/admin/ui/rowAction";
import { TableSkeleton } from "@/components/admin/ui/adminSkeleton";
import ListSearch from "@/components/admin/ui/listSearch";
import DateRange, { urlDay } from "@/components/admin/ui/dateRange";
import { useUrlFilters } from "@/components/admin/ui/useUrlFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";

import { LuUndo2 } from "react-icons/lu";

const STATUS_VARIANT = { completed: "success", pending: "info", failed: "destructive", cancelled: "muted", expired: "muted", refunded: "warning" };
const STATUSES = Object.keys(STATUS_VARIANT);
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

function Loading() {
    return <TableSkeleton rows={6} columns={6} label="Loading orders" />;
}

export default function OrdersAdmin() {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const [{ q, status, from, to }, update] = useUrlFilters({ q: 100, status: STATUSES, from: 10, to: 10 });
    const filters = { q, status, from: urlDay(from), to: urlDay(to) };
    const filtered = Object.values(filters).some(Boolean);
    const { data, isPending, isError, refetch } = useQuery(adminQueries.orders(filters));
    const refund = useAdminRefund();
    const [refunding, setRefunding] = useState(null);

    const filterBar = (
        <ListSearch value={q} onChange={(value) => update({ q: value })} label="Order id or buyer username" delay={300}>
            <Select value={status || "any"} onValueChange={(value) => update({ status: value === "any" ? "" : value })}>
                <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="any">Any status</SelectItem>
                    {STATUSES.map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}
                </SelectContent>
            </Select>
            <DateRange id="orders-date" label="Order date" from={filters.from} to={filters.to} onChange={update} />
            {filtered && <Button variant="ghost" size="sm" onClick={() => update({ q: "", status: "", from: "", to: "" })}>Clear filters</Button>}
        </ListSearch>
    );

    if (isPending) return <>{filterBar}<Loading /></>;
    if (isError) return <>{filterBar}<ErrorReload refetch={refetch} /></>;

    const doRefund = (order, reason) => {
        refund.mutate(
            { orderId: order.id, reason },
            {
                onSuccess: (result) => showAlert(200, `Refunded. New balance: ${result.balanceAfter} pts`),
                onError: (error) => showAlert(error?.status || 500, error?.message || "Refund failed"),
            }
        );
    };

    return (
        <>
        {filterBar}
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="@max-2xl:hidden">Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="@max-2xl:hidden">Course</TableHead>
                    <TableHead className="@max-2xl:hidden">Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.length === 0 && filtered && (
                    <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No order matches these filters.</TableCell>
                    </TableRow>
                )}
                {data.length === 0 && !filtered && (
                    <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                            No orders yet. Prices are set per course under{" "}
                            <Link href="/admin/courses" className="font-medium text-primary-ink hover:underline">Courses</Link>.
                        </TableCell>
                    </TableRow>
                )}
                {data.map((order) => (
                    <TableRow key={order.id}>
                        <TableCell className="whitespace-nowrap @max-2xl:hidden">{formatDateTime(order.created_at)}</TableCell>
                        <TableCell>{order.username}</TableCell>
                        <TableCell className="max-w-56 truncate @max-2xl:hidden">{order.course_title}</TableCell>
                        <TableCell className="@max-2xl:hidden">{order.payment_method === "points" ? "Points" : "Online payment"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                            {order.payment_method === "points" ? `${order.points_total} pts` : formatMoney(order.amount_minor, order.currency)}
                        </TableCell>
                        <TableCell>
                            <Badge variant={STATUS_VARIANT[order.status] || "muted"}>{order.status}</Badge>
                            {order.failure_reason === "already_owned_refund_required" && order.status !== "refunded" && (
                                <span className="ml-2 text-xs text-warning">refund needed</span>
                            )}
                        </TableCell>
                        <TableCell className="text-right">
                            {can("order.refund") && order.payment_method === "points" && order.status === "completed" && (
                                <RowAction icon={LuUndo2} label="Refund" target={`${order.username}, ${order.course_title}`} tone="danger" disabled={refund.isPending} onClick={() => setRefunding(order)} />
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>

        <ConfirmDialog
            open={Boolean(refunding)}
            onOpenChange={(open) => !open && setRefunding(null)}
            title="Refund this order?"
            description={`${refunding?.points_total} pts go back to ${refunding?.username} and their access to "${refunding?.course_title}" is revoked.`}
            confirmLabel="Refund and revoke"
            reasonLabel="Reason for the refund"
            onConfirm={(reason) => doRefund(refunding, reason)}
        />
        </>
    );
}
