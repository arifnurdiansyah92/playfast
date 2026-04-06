// MUI Imports
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'

// Third-party Imports
import 'react-perfect-scrollbar/dist/css/styles.css'

// Type Imports
import type { ChildrenType } from '@core/types'

// Util Imports
import { getSystemMode } from '@core/utils/serverHelpers'

// Component Imports
import QueryProvider from '@components/QueryProvider'
import { AuthProvider } from '@/contexts/AuthContext'

// Style Imports
import '@/app/globals.css'

// Generated Icon CSS Imports
import '@assets/iconify-icons/generated-icons.css'

export const metadata = {
  title: 'SDA - Steam Game Sharing Platform',
  description: 'Share and play Steam games with ease'
}

const RootLayout = async (props: ChildrenType) => {
  const { children } = props

  const systemMode = await getSystemMode()
  const direction = 'ltr'

  return (
    <html id='__next' lang='en' dir={direction} suppressHydrationWarning>
      <body className='flex is-full min-bs-full flex-auto flex-col'>
        <InitColorSchemeScript attribute='data' defaultMode={systemMode} />
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}

export default RootLayout
