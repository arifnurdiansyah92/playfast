import type { Metadata } from 'next'

import RegisterPage from '@views/RegisterPage'

export const metadata: Metadata = {
  title: 'Daftar - Playfast',
  description: 'Buat akun Playfast baru'
}

const RegisterRoute = () => {
  return <RegisterPage />
}

export default RegisterRoute
