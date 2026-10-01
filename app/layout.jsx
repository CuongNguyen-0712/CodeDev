import './globals.css';

import { Provider } from '@/contexts/providers';
import { AuthSessionWatcher } from '@/components/auth/sessionWatcher';

export default async function RootLayout({ children }) {
  return (
    <html lang='en'>
      <head>
        <title>CodeDev</title>
        <link rel="icon" href='/image/static/logo.svg' />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className='overlay hidden' id='overlay' aria-hidden="true"></div>
        <Provider>
          <AuthSessionWatcher />
          {children}
        </Provider>
      </body>
    </html>
  );
}
