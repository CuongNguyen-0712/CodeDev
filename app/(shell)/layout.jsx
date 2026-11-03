import HomeLayout from "@/components/layouts/homeLayout";
import Footer from "@/components/ui/footer";

// Pages with the sidebar + navbar shell. One layout for the group, so the shell stays mounted
// while navigating between these pages (only the page below it changes). URLs are unchanged:
// the (shell) folder is a route group.
export default function ShellLayout({ children }) {
    return (
        <HomeLayout footer={<Footer />}>
            {children}
        </HomeLayout>
    );
}
