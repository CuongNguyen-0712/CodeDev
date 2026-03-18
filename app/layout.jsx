import './globals.css';
import Provider from './contexts/providers';
import { AuthProvider } from './contexts/authContext';
import { getSession } from './lib/session';

import Search from './component/home/search';

export default async function RootLayout({ children }) {
  const session = await getSession();
  return (
    <html lang='en'>
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
        <AuthProvider initialSession={{ username: session?.username, email: session?.email }}>
          <Provider>
            {children}
            <Search />
          </Provider>
        </AuthProvider>
      </body>
    </html>
  )
}
