import './globals.css';
import dynamic from 'next/dynamic';
import Provider from './contexts/providers';

const Search = dynamic(() => import('./component/home/search'), {
  ssr: false,
});

export default async function RootLayout({ children }) {
  return (
    <html lang='en' data-scroll-behavior="smooth">
      <head>
        <title>CodeDev</title>
        <link rel="icon" href='/image/static/logo.svg' />
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
          <Search />
        </Provider>
      </body>
    </html>
  )
}
