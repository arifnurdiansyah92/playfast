// MUI Imports
import Script from 'next/script'

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'


// Third-party Imports
import 'react-perfect-scrollbar/dist/css/styles.css'

// Type Imports
import type { ChildrenType } from '@core/types'

// Util Imports
import { getSystemMode } from '@core/utils/serverHelpers'

// Component Imports
import QueryProvider from '@components/QueryProvider'
import { AuthProvider } from '@/contexts/AuthContext'

// Style Imports
import '@/app/globals.css'

// Generated Icon CSS Imports
import '@assets/iconify-icons/generated-icons.css'

export const metadata = {
  title: 'Playfast - Akses Game Steam Instan',
  description: 'Main game Steam apapun secara instan. Kode Steam Guard otomatis.'
}

const RootLayout = async (props: ChildrenType) => {
  const { children } = props

  const systemMode = await getSystemMode()
  const direction = 'ltr'

  return (
    <html id='__next' lang='id' dir={direction} suppressHydrationWarning>
      <head>
        <script
          type='text/javascript'
          src='https://app.sandbox.midtrans.com/snap/snap.js'
          data-client-key='SB-Mid-client-VNwEU_8NEdo5N3og'
        />
      </head>
      <body className='flex is-full min-bs-full flex-auto flex-col'>
        <InitColorSchemeScript attribute='data' defaultMode={systemMode} />
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>

        {/* Tawk.to live chat widget — loads after page is interactive */}
        <Script
          id='tawk-to'
          strategy='afterInteractive'
          dangerouslySetInnerHTML={{
            __html: `
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;
s1.src='https://embed.tawk.to/69ed66917bef971c3ada900d/1jn3lhab9';
s1.charset='UTF-8';
s1.setAttribute('crossorigin','*');
s0.parentNode.insertBefore(s1,s0);
})();
            `,
          }}
        />
      </body>
    </html>
  )
}

export default RootLayout
