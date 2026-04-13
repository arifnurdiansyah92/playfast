import type { Metadata } from 'next'

import VerifyEmailPage from '@views/VerifyEmailPage'

export const metadata: Metadata = {
  title: 'Verifikasi Email - Playfast',
}

export default function VerifyEmailRoute() {
  return <VerifyEmailPage />
}
