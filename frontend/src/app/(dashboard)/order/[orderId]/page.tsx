import type { Metadata } from 'next'

import OrderConfirmPage from '@/views/OrderConfirmPage'

export const metadata: Metadata = {
  title: 'Order Confirmed - Playfast'
}

export default async function Page(props: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await props.params

  return <OrderConfirmPage orderId={orderId} />
}
