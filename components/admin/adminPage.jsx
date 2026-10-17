'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

import CourseAdmin from "@/components/admin/courseAdmin";
import AccessAdmin from "@/components/admin/accessAdmin";
import OrdersAdmin, { AuditLog } from "@/components/admin/ordersAdmin";

/**
 * Admin area. `permissions` only decides which controls are shown; every API re-checks the
 * caller's permissions in the database, so hiding a button is never the security boundary.
 */
export default function AdminPage({ permissions = [] }) {
    const can = (permission) => permissions.includes(permission);
    const showAccess = can("points.adjust") || can("entitlement.grant");

    return (
        <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
                <p className="text-sm text-muted-foreground">
                    Course metadata, publishing, prices, points and access. Every change is written to the audit log.
                </p>
            </header>

            <Tabs defaultValue="courses" className="gap-4">
                <TabsList>
                    <TabsTrigger value="courses">Courses</TabsTrigger>
                    {showAccess && <TabsTrigger value="access">Points &amp; access</TabsTrigger>}
                    {can("order.list") && <TabsTrigger value="orders">Orders</TabsTrigger>}
                    <TabsTrigger value="audit">Audit log</TabsTrigger>
                </TabsList>

                <TabsContent value="courses">
                    <CourseAdmin can={can} />
                </TabsContent>
                {showAccess && (
                    <TabsContent value="access">
                        <AccessAdmin can={can} />
                    </TabsContent>
                )}
                {can("order.list") && (
                    <TabsContent value="orders">
                        <OrdersAdmin can={can} />
                    </TabsContent>
                )}
                <TabsContent value="audit">
                    <AuditLog />
                </TabsContent>
            </Tabs>
        </section>
    );
}
