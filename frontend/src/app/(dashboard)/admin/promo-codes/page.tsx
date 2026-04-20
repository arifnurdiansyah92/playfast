import type { Metadata } from 'next'
import AdminPromoCodesPage from '@/views/admin/AdminPromoCodesPage'

export const metadata: Metadata = { title: 'Promo Codes - Playfast Admin' }

export default function Page() {
  return <AdminPromoCodesPage />
}
