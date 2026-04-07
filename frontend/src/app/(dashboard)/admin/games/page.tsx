import type { Metadata } from 'next'

import AdminGamesPage from '@views/admin/AdminGamesPage'

export const metadata: Metadata = {
  title: 'Games Catalog - Playfast Admin',
  description: 'Manage game catalog'
}

export default function AdminGamesRoute() {
  return <AdminGamesPage />
}
