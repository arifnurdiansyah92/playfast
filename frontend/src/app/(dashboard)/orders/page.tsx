import type { Metadata } from 'next'

import OrderHistoryPage from '@views/orders/OrderHistoryPage'

export const metadata: Metadata = {
  title: 'Riwayat Pesanan - Playfast',
  description: 'Lihat riwayat pesanan kamu'
}

export default function OrderHistoryRoute() {
  return <OrderHistoryPage />
}
