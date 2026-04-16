import type { Metadata } from 'next'

import CatalogShowcasePage from '@/views/CatalogShowcasePage'

export const metadata: Metadata = {
  title: 'Katalog Game - Playfast',
  description: 'Lihat semua game yang tersedia di Playfast. Ratusan game Steam dengan akses instan.',
}

const KatalogRoute = () => {
  return <CatalogShowcasePage />
}

export default KatalogRoute
