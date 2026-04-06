import type { Metadata } from 'next'

import AdminAccountsPage from '@views/admin/AdminAccountsPage'

export const metadata: Metadata = {
  title: 'Steam Accounts - SDA Admin',
  description: 'Manage Steam accounts'
}

export default function AdminAccountsRoute() {
  return <AdminAccountsPage />
}
