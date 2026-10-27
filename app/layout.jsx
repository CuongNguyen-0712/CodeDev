import './globals.css';

import { fontVariables } from './fonts';

import { THEME_SCRIPT } from '@/lib/themeScript';

import { Provider } from '@/contexts/providers';
import { AuthSessionWatcher } from '@/components/auth/sessionWatcher';

export default async function RootLayout({ children }) {
  return (
    <html lang='en' className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <title>CodeDev</title>
        <link rel="icon" href='/image/static/logo.svg' />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <Provider>
          <AuthSessionWatcher />
          {children}
        </Provider>
      </body>
    </html>
  );
}
