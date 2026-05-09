import type { Metadata } from 'next'

import ReviewsListPage from '@/views/ReviewsListPage'

export const metadata: Metadata = {
  title: 'Review Pelanggan - Playfast',
  description: 'Cerita langsung dari pelanggan Playfast tentang pengalaman main game Steam dengan harga terjangkau.',
}

const ReviewsRoute = () => {
  return <ReviewsListPage />
}

export default ReviewsRoute
