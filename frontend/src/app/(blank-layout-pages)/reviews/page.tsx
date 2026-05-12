import type { Metadata } from 'next'

import ReviewsListPage from '@/views/ReviewsListPage'

export const metadata: Metadata = {
  title: 'Review Pelanggan Playfast',
  description:
    'Cerita langsung dari pelanggan Playfast tentang pengalaman main game Steam dengan akses instan dan harga terjangkau.',
  alternates: { canonical: '/reviews' },
  openGraph: {
    title: 'Review Pelanggan Playfast',
    description:
      'Cerita langsung dari pelanggan Playfast tentang pengalaman main game Steam dengan akses instan dan harga terjangkau.',
    url: 'https://playfast.id/reviews',
    type: 'website'
  },
  twitter: {
    title: 'Review Pelanggan Playfast',
    description:
      'Cerita langsung dari pelanggan Playfast tentang pengalaman main game Steam dengan akses instan dan harga terjangkau.'
  }
}

const ReviewsRoute = () => {
  return <ReviewsListPage />
}

export default ReviewsRoute
