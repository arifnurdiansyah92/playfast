import type { Metadata } from 'next'

import RegisterPage from '@views/RegisterPage'

export const metadata: Metadata = {
  title: 'Register - SDA',
  description: 'Create a new SDA account'
}

const RegisterRoute = () => {
  return <RegisterPage />
}

export default RegisterRoute
