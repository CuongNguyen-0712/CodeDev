import PageHeader from "@/components/admin/shell/pageHeader";

/** Shown inside the admin shell when the viewer lacks the screen's permission. */
export default function NoAccess({ title }) {
    return (
        <>
            <PageHeader title={title} />
            <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                Your role does not include this screen. Ask a super admin if you need it.
            </p>
        </>
    );
}
