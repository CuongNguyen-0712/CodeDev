import AdminPageSkeleton from "@/components/admin/ui/adminSkeleton";

// Shown inside the admin shell while a screen's server part (permission checks, metadata) loads.
export default function AdminLoading() {
    return <AdminPageSkeleton />;
}
