import type { Metadata } from 'next'

import OrderConfirmPage from '@/views/OrderConfirmPage'

export const metadata: Metadata = {
  // OrderConfirmPage rewrites document.title with the game name once the
  // order loads — this is the server-side fallback while data hydrates.
  title: 'Pesanan'
}

export default async function Page(props: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await props.params

  return <OrderConfirmPage orderId={orderId} />
}
