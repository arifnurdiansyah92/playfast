import type { Metadata } from 'next'

import StorePage from '@views/store/StorePage'

export const metadata: Metadata = {
  title: 'Toko Game - Playfast',
  description: 'Cari dan dapatkan akses ke game Steam'
}

export default function StoreRoute() {
  return <StorePage />
}
