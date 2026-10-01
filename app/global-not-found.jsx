import './globals.css';

import NotFound from '@/components/ui/pageNotFound';

export const metadata = {
    title: "Page not found | CodeDev",
    description: "The page you are looking for does not exist.",
};

export default async function GlobalNotFound() {
    return (
        <html lang='en'>
            <head>
                <link rel="icon" href='/image/static/logo.svg' height={32} width={32} />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap" rel="stylesheet" />
            </head>
            <body>
                <NotFound />
            </body>
        </html>
    );
}