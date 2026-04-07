import type { Metadata } from 'next'

import RegisterPage from '@views/RegisterPage'

export const metadata: Metadata = {
  title: 'Register - Playfast',
  description: 'Create a new Playfast account'
}

const RegisterRoute = () => {
  return <RegisterPage />
}

export default RegisterRoute
