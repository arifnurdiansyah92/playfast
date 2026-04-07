import type { Metadata } from 'next'

import LoginPage from '@views/LoginPage'

export const metadata: Metadata = {
  title: 'Masuk - Playfast',
  description: 'Masuk ke akun Playfast kamu'
}

const LoginRoute = () => {
  return <LoginPage />
}

export default LoginRoute
