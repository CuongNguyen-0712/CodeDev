import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <title>CodeDev</title>
        <link rel="icon" href="./image/logo.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}
