import type { Metadata } from 'next'

import CartCheckoutPage from '@/views/CartCheckoutPage'

export const metadata: Metadata = { title: 'Checkout - Playfast' }

export default function Page() {
  return <CartCheckoutPage />
}
