import type { Metadata } from 'next'

import CatalogShowcasePage from '@/views/CatalogShowcasePage'

export const metadata: Metadata = {
  title: 'Katalog Game Steam — Ratusan Judul Akses Instan',
  description:
    'Lihat semua game Steam yang tersedia di Playfast. Ratusan judul AAA dan indie, kode Steam Guard otomatis, harga mulai Rp 50K.',
  alternates: { canonical: '/katalog' },
  openGraph: {
    title: 'Katalog Game Steam — Ratusan Judul Akses Instan',
    description:
      'Lihat semua game Steam yang tersedia di Playfast. Ratusan judul AAA dan indie, kode Steam Guard otomatis, harga mulai Rp 50K.',
    url: 'https://playfast.id/katalog',
    type: 'website'
  },
  twitter: {
    title: 'Katalog Game Steam — Ratusan Judul Akses Instan',
    description:
      'Lihat semua game Steam yang tersedia di Playfast. Ratusan judul AAA dan indie, kode Steam Guard otomatis, harga mulai Rp 50K.'
  }
}

const KatalogRoute = () => {
  return <CatalogShowcasePage />
}

export default KatalogRoute
