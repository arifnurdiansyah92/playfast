import type { Metadata } from 'next'

import ProfilePage from '@views/ProfilePage'

export const metadata: Metadata = {
  title: 'Profil - Playfast',
  description: 'Manage your account settings'
}

export default function ProfileRoute() {
  return <ProfilePage />
}
