import './globals.css';
import Provider from './contexts/providers';
import { Plus_Jakarta_Sans } from 'next/font/google';

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
          {children}
        </Provider>
      </body>
    </html>
  )
}
