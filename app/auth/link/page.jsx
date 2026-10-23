import LinkAccount from "@/components/auth/linkAccount"

import DefaultLayout from '@/components/layouts/defaultLayout'

export async function generateMetadata() {
    return {
        title: "Link your account | CodeDev",
        description: "Confirm your CodeDev password to link GitHub or Google.",
    }
}

export default function Page() {
    return (
        <DefaultLayout>
            <main className="flex min-h-[70dvh] w-full items-center justify-center px-4 py-16 sm:px-6">
                <LinkAccount />
            </main>
        </DefaultLayout>
    )
}
