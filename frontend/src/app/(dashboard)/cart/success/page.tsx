import type { Metadata } from 'next'

import CartSuccessPage from '@/views/CartSuccessPage'

export const metadata: Metadata = { title: 'Pesanan Berhasil - Playfast' }

export default function Page() {
  return <CartSuccessPage />
}
