// MUI Imports
import Script from 'next/script'

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'


// Third-party Imports
import 'react-perfect-scrollbar/dist/css/styles.css'

// Type Imports
import type { Metadata } from 'next'

import type { ChildrenType } from '@core/types'

// Util Imports
import { getSystemMode } from '@core/utils/serverHelpers'

// Component Imports
import QueryProvider from '@components/QueryProvider'
import TawkIdentity from '@components/TawkIdentity'
import { AuthProvider } from '@/contexts/AuthContext'

// Style Imports
import '@/app/globals.css'

// Generated Icon CSS Imports
import '@assets/iconify-icons/generated-icons.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://playfast.id'),
  title: {
    default: 'Akses Game Steam Instan — Mulai Rp 50K | Playfast',
    template: '%s | Playfast'
  },
  description:
    'Akses 300+ game Steam dengan harga mulai Rp 50K. Kode Steam Guard otomatis 24/7 — login langsung, no nunggu seller. Coba Premium hari ini.',
  applicationName: 'Playfast',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Playfast',
    locale: 'id_ID',
    url: 'https://playfast.id',
    title: 'Akses Game Steam Instan — Mulai Rp 50K | Playfast',
    description: 'Akses 300+ game Steam dengan harga mulai Rp 50K. Kode Steam Guard otomatis 24/7.',
    images: [{ url: '/images/brand/logo-horizontal.png', width: 1200, height: 630, alt: 'Playfast' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Akses Game Steam Instan — Mulai Rp 50K | Playfast',
    description: 'Akses 300+ game Steam dengan harga mulai Rp 50K. Kode Steam Guard otomatis 24/7.',
    images: ['/images/brand/logo-horizontal.png']
  },
  robots: { index: true, follow: true }
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
          <AuthProvider>
            <TawkIdentity />
            {children}
          </AuthProvider>
        </QueryProvider>

        {/* Google Analytics (gtag.js) — loads after page is interactive */}
        <Script
          id='gtag-loader'
          src='https://www.googletagmanager.com/gtag/js?id=G-J6HPBP2R83'
          strategy='afterInteractive'
        />
        <Script
          id='gtag-init'
          strategy='afterInteractive'
          dangerouslySetInnerHTML={{
            __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-J6HPBP2R83');
            `,
          }}
        />

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

        {/* Organization JSON-LD */}
        <Script
          id='ld-organization'
          type='application/ld+json'
          strategy='afterInteractive'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Playfast',
              url: 'https://playfast.id',
              logo: 'https://playfast.id/images/brand/logo-horizontal.png',
              sameAs: [],
              contactPoint: {
                '@type': 'ContactPoint',
                email: 'support@playfast.id',
                contactType: 'customer support',
                areaServed: 'ID',
                availableLanguage: ['id', 'en']
              }
            })
          }}
        />

        {/* WebSite JSON-LD */}
        <Script
          id='ld-website'
          type='application/ld+json'
          strategy='afterInteractive'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Playfast',
              url: 'https://playfast.id',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://playfast.id/store?q={search_term_string}',
                'query-input': 'required name=search_term_string'
              }
            })
          }}
        />
      </body>
    </html>
  )
}

export default RootLayout
