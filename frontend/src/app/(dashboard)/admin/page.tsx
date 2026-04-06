import type { Metadata } from 'next'

import AdminDashboardPage from '@views/admin/AdminDashboardPage'

export const metadata: Metadata = {
  title: 'Admin Dashboard - SDA',
  description: 'Administration dashboard'
}

export default function AdminDashboardRoute() {
  return <AdminDashboardPage />
}
