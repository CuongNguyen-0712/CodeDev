import OrdersAdmin from "@/components/admin/ordersAdmin";
import NoAccess from "@/components/admin/shell/noAccess";
import PageHeader from "@/components/admin/shell/pageHeader";
import { adminCan } from "@/lib/adminPage";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
    if (!(await adminCan("order.list"))) return <NoAccess title="Orders" />;
    return (
        <>
            <PageHeader title="Orders" />
            <OrdersAdmin />
        </>
    );
}
