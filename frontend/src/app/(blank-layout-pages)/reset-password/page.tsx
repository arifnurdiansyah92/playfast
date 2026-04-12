import type { Metadata } from 'next'

import ResetPasswordPage from '@views/ResetPasswordPage'

export const metadata: Metadata = {
  title: 'Reset Password - Playfast',
  description: 'Set password baru untuk akun Playfast'
}

export default function ResetPasswordRoute() {
  return <ResetPasswordPage />
}
