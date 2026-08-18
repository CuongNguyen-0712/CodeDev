import './globals.css';

import NotFound from "./component/ui/pageNotFound"
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    variable: '--font-jakarta',
    display: 'swap',
});

export const metadata = {
    title: "Page not found | CodeDev",
    description: "The page you are looking for does not exist.",
}

export default async function GlobalNotFound() {
    return (
        <html lang='en' data-scroll-behavior="smooth">
            <head>
                <link rel="icon" href='/image/static/logo.svg' height={32} width={32} />
            </head>
            <body className={jakarta.className}>
                <NotFound />
            </body>
        </html>
    )
}