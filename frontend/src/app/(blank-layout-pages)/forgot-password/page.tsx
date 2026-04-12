import type { Metadata } from 'next'

import ForgotPasswordPage from '@views/ForgotPasswordPage'

export const metadata: Metadata = {
  title: 'Lupa Password - Playfast',
  description: 'Reset password akun Playfast'
}

export default function ForgotPasswordRoute() {
  return <ForgotPasswordPage />
}
