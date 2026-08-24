import './globals.css';
import { Plus_Jakarta_Sans } from 'next/font/google';

import { Provider } from './contexts/providers';

import { AuthSessionWatcher } from './component/auth/sessionWatcher';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export default async function RootLayout({ children }) {
  return (
    <html lang='en' data-scroll-behavior="smooth">
      <head>
        <title>CodeDev</title>
        <link rel="icon" href='/image/static/logo.svg' />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className={jakarta.className}>
        <Provider>
          <AuthSessionWatcher />
          {children}
        </Provider>
      </body>
    </html>
  )
}
