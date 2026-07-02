import './globals.css';
import { Open_Sans } from 'next/font/google'

import NotFound from "./component/ui/pageNotFound"

export const metadata = {
    title: "Page not found | CodeDev",
    description: "The page you are looking for does not exist.",
}

const openSans = Open_Sans({
    subsets: ['latin'],
})

export default async function GlobalNotFound() {
    return (
        <html lang='en' data-scroll-behavior="smooth">
            <head>
                <link rel="icon" href='/image/static/logo.svg' />
            </head>
            <body className={openSans.className}>
                <NotFound />
            </body>
        </html>
    )
}