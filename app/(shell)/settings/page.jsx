import SettingsPage from "@/components/settings/settingsPage"

export async function generateMetadata() {
    return {
        title: "Settings | CodeDev",
        description: "Manage your account settings and preferences",
    }
}

export default function Page() {
    return (
        <SettingsPage />
    )
}