import './globals.css';

import { fontVariables } from './fonts';

import { THEME_SCRIPT } from '@/lib/themeScript';

import NotFound from '@/components/ui/pageNotFound';

export const metadata = {
    title: "Page not found | CodeDev",
    description: "The page you are looking for does not exist.",
};

export default async function GlobalNotFound() {
    return (
        <html lang='en' className={fontVariables} suppressHydrationWarning>
            <head>
                {/* Same theme as the rest of the app: without it a dark-mode visitor gets a white 404. */}
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
                <link rel="icon" href='/image/static/logo.svg' height={32} width={32} />
            </head>
            <body>
                <NotFound />
            </body>
        </html>
    );
}
