import type { Metadata } from 'next'

import AdminOrdersPage from '@views/admin/AdminOrdersPage'

export const metadata: Metadata = {
  title: 'Orders - SDA Admin',
  description: 'Manage orders'
}

export default function AdminOrdersRoute() {
  return <AdminOrdersPage />
}
