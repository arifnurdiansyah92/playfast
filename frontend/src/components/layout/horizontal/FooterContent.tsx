'use client'

// Next.js Imports
import Link from 'next/link'

// Third-party Imports
import classnames from 'classnames'

// Hook Imports
import useHorizontalNav from '@menu/hooks/useHorizontalNav'

// Util Imports
import { horizontalLayoutClasses } from '@layouts/utils/layoutClasses'

const FooterContent = () => {
  const { isBreakpointReached } = useHorizontalNav()

  return (
    <div
      className={classnames(horizontalLayoutClasses.footerContent, 'flex items-center justify-between flex-wrap gap-4')}
    >
      <p>
        <span className='text-textSecondary'>{`© 2026 Playfast. Hak cipta dilindungi.`}</span>
      </p>
      {!isBreakpointReached && (
        <div className='flex items-center gap-4'>
          <Link href='/syarat-ketentuan' className='text-textSecondary text-sm hover:text-primary' style={{ textDecoration: 'none' }}>
            Syarat &amp; Ketentuan
          </Link>
          <Link href='/kebijakan-privasi' className='text-textSecondary text-sm hover:text-primary' style={{ textDecoration: 'none' }}>
            Kebijakan Privasi
          </Link>
          <Link href='/bantuan' className='text-textSecondary text-sm hover:text-primary' style={{ textDecoration: 'none' }}>
            Bantuan
          </Link>
        </div>
      )}
    </div>
  )
}

export default FooterContent
