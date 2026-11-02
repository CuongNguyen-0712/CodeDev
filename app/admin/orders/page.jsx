import OrdersAdmin from "@/components/admin/ordersAdmin";
import NoAccess from "@/components/admin/shell/noAccess";
import PageHeader from "@/components/admin/shell/pageHeader";
import { OrdersFinding } from "@/components/admin/ui/pageFindings";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
    if (!(await adminCan("order.list"))) return <NoAccess title="Orders" />;
    return (
        <>
            <PageHeader title="Orders" description={<OrdersFinding fallback="Course purchases with points and online payment." />} />
            <OrdersAdmin />
        </>
    );
}
