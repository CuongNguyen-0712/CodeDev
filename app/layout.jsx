import './globals.css';

import { fontVariables } from './fonts';

import { Provider } from '@/contexts/providers';
import { AuthSessionWatcher } from '@/components/auth/sessionWatcher';

export default async function RootLayout({ children }) {
  return (
    <html lang='en' className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Applies the saved / system theme before the first paint (contexts/themeContext.jsx keeps it in sync afterwards). */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
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
