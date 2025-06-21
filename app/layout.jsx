import './globals.css';
import Provider from './contexts/providers';

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <title>CodeDev</title>
        <link rel="icon" href="./image/logo.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link
          rel="preload"
          href="/font/OpenSans-VariableFont_wdth,wght.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <Provider>
          {children}
        </Provider>
      </body>
    </html>
  )
}
