import type { Metadata } from 'next'

import LoginPage from '@views/LoginPage'

export const metadata: Metadata = {
  title: 'Login - Playfast',
  description: 'Login to your Playfast account'
}

const LoginRoute = () => {
  return <LoginPage />
}

export default LoginRoute
