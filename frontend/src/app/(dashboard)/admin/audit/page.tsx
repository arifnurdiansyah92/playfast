import type { Metadata } from 'next'

import AdminAuditPage from '@views/admin/AdminAuditPage'

export const metadata: Metadata = {
  title: 'Audit Log - SDA Admin',
  description: 'View code request audit log'
}

export default function AdminAuditRoute() {
  return <AdminAuditPage />
}
