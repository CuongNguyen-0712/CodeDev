'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { adminQueries } from "@/queries/premium.query";
import { useAdminRefund } from "@/mutations/premium.mutation";

import { formatMoney } from "@/components/admin/courseAdmin";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { ErrorReload } from "@/components/ui/error";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";

const STATUS_VARIANT = { completed: "success", pending: "info", failed: "destructive", cancelled: "muted", expired: "muted", refunded: "warning" };
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

function Loading() {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
}

export default function OrdersAdmin({ can }) {
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
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Method</TableHead>
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
                        <TableCell className="whitespace-nowrap">{formatDateTime(order.created_at)}</TableCell>
                        <TableCell>{order.username}</TableCell>
                        <TableCell className="max-w-56 truncate">{order.course_title}</TableCell>
                        <TableCell>{order.payment_method === "points" ? "Points" : "Online payment"}</TableCell>
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
                                <Button size="sm" variant="outline" disabled={refund.isPending} onClick={() => setRefunding(order)}>Refund</Button>
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

export function AuditLog() {
    const { data, isPending, isError, refetch } = useQuery(adminQueries.audit());

    if (isPending) return <Loading />;
    if (isError) return <ErrorReload refetch={refetch} />;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Reason</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nothing logged yet.</TableCell></TableRow>
                )}
                {data.map((entry) => (
                    <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(entry.created_at)}</TableCell>
                        <TableCell>{entry.actor || "(deleted)"}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.target_type}:{entry.target_id}</TableCell>
                        <TableCell className="max-w-72 truncate">{entry.reason || "-"}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
