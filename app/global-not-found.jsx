import './globals.css';

import { fontVariables } from './fonts';

import NotFound from '@/components/ui/pageNotFound';

export const metadata = {
    title: "Page not found | CodeDev",
    description: "The page you are looking for does not exist.",
};

export default async function GlobalNotFound() {
    return (
        <html lang='en' className={fontVariables}>
            <head>
                <link rel="icon" href='/image/static/logo.svg' height={32} width={32} />
            </head>
            <body>
                <NotFound />
            </body>
        </html>
    );
}
