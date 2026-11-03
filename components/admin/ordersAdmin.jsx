'use client';

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

import { LuUndo2 } from "react-icons/lu";

const STATUS_VARIANT = { completed: "success", pending: "info", failed: "destructive", cancelled: "muted", expired: "muted", refunded: "warning" };
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

function Loading() {
    return <TableSkeleton rows={6} columns={6} label="Loading orders" />;
}

export default function OrdersAdmin() {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const { data, isPending, isError, refetch } = useQuery(adminQueries.orders());
    const refund = useAdminRefund();
    const [refunding, setRefunding] = useState(null);

    if (isPending) return <Loading />;
    if (isError) return <ErrorReload refetch={refetch} />;

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
                {data.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No orders yet.</TableCell></TableRow>
                )}
                {data.map((order) => (
                    <TableRow key={order.id}>
                        <TableCell className="whitespace-nowrap @max-2xl:hidden">{formatDateTime(order.created_at)}</TableCell>
                        <TableCell>{order.username}</TableCell>
                        <TableCell className="max-w-56 truncate @max-2xl:hidden">{order.course_title}</TableCell>
                        <TableCell className="@max-2xl:hidden">{order.payment_method === "points" ? "Points" : "Online payment"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                            {order.payment_method === "points" ? `${order.points_total} pts` : formatMoney(order.amount_minor, order.currency)}
                        </TableCell>
                        <TableCell>
                            <Badge variant={STATUS_VARIANT[order.status] || "muted"}>{order.status}</Badge>
                            {order.failure_reason === "already_owned_refund_required" && (
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
