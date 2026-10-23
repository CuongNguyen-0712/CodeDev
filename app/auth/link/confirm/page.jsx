import ConfirmLink from "@/components/auth/confirmLink"

import DefaultLayout from '@/components/layouts/defaultLayout'

export async function generateMetadata() {
    return {
        title: "Confirm account link | CodeDev",
        description: "Confirm linking GitHub or Google to your CodeDev account.",
        // The token is in the URL until the page removes it: never send it as a Referer.
        referrer: "no-referrer",
    }
}

export default function Page() {
    return (
        <DefaultLayout>
            <main className="flex min-h-[70dvh] w-full items-center justify-center px-4 py-16 sm:px-6">
                <ConfirmLink />
            </main>
        </DefaultLayout>
    )
}
