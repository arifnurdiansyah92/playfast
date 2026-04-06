import type { Metadata } from 'next'

import LoginPage from '@views/LoginPage'

export const metadata: Metadata = {
  title: 'Login - SDA',
  description: 'Login to your SDA account'
}

const LoginRoute = () => {
  return <LoginPage />
}

export default LoginRoute
