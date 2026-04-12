'use client'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import classnames from 'classnames'

// MUI Imports
import Button from '@mui/material/Button'

// Component Imports
import NavToggle from './NavToggle'
import ModeDropdown from '@components/layout/shared/ModeDropdown'
import UserDropdown from '@components/layout/shared/UserDropdown'

// Util Imports
import { verticalLayoutClasses } from '@layouts/utils/layoutClasses'

// Context Imports
import { useAuth } from '@/contexts/AuthContext'

const NavbarContent = () => {
  const { user } = useAuth()

  return (
    <div className={classnames(verticalLayoutClasses.navbarContent, 'flex items-center justify-between gap-4 is-full')}>
      <div className='flex items-center gap-4'>
        <NavToggle />
        <ModeDropdown />
      </div>
      <div className='flex items-center gap-2'>
        {user ? (
          <UserDropdown />
        ) : (
          <>
            <Button component={Link} href='/login' variant='text' size='small' sx={{ fontWeight: 600 }}>
              Masuk
            </Button>
            <Button component={Link} href='/register' variant='contained' size='small'>
              Daftar
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export default NavbarContent
