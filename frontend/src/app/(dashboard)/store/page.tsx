import type { Metadata } from 'next'

import StorePage from '@views/store/StorePage'

export const metadata: Metadata = {
  title: 'Store - SDA',
  description: 'Browse and purchase Steam games'
}

export default function StoreRoute() {
  return <StorePage />
}
