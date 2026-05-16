import type { Metadata } from 'next'

import CartPage from '@/views/CartPage'

export const metadata: Metadata = { title: 'Keranjang - Playfast' }

export default function Page() {
  return <CartPage />
}
