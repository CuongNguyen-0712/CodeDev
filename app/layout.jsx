import './globals.css';
import Provider from './contexts/providers';
import { Open_Sans } from 'next/font/google'

const openSans = Open_Sans({
  subsets: ['latin'],
})

export default async function RootLayout({ children }) {
  return (
    <html lang='en' data-scroll-behavior="smooth">
      <head>
        <title>CodeDev</title>
        <link rel="icon" href='/image/static/logo.svg' />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className={openSans.className}>
        <Provider>
          {children}
        </Provider>
      </body>
    </html>
  )
}
