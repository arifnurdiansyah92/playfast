// MUI Imports

// Third-party Imports

// Type Imports

// Next Imports
import Link from 'next/link'

import PerfectScrollbar from 'react-perfect-scrollbar'
import { useTheme } from '@mui/material/styles'

// MUI Imports
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'

import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu'

// Component Imports
import { Menu, MenuItem, SubMenu, MenuSection } from '@menu/vertical-menu'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Styled Component Imports
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/vertical/menuItemStyles'
import menuSectionStyles from '@core/styles/vertical/menuSectionStyles'

// Context Imports
import { useAuth } from '@/contexts/AuthContext'
import { useWhatsappNumber } from '@/hooks/useWhatsappNumber'

type RenderExpandIconProps = {
  open?: boolean
  transitionDuration?: VerticalMenuContextProps['transitionDuration']
}

type Props = {
  scrollMenu: (container: any, isPerfectScrollbar: boolean) => void
}

const RenderExpandIcon = ({ open, transitionDuration }: RenderExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='tabler-chevron-right' />
  </StyledVerticalNavExpandIcon>
)

const VerticalMenu = ({ scrollMenu }: Props) => {
  // Hooks
  const theme = useTheme()
  const verticalNavOptions = useVerticalNav()
  const { user } = useAuth()
  const waNumber = useWhatsappNumber()
  const waSupportUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent('Halo Playfast, saya butuh bantuan.')}`

  // Vars
  const { isBreakpointReached, transitionDuration } = verticalNavOptions
  const isAdmin = user?.role === 'admin'

  const ScrollWrapper = isBreakpointReached ? 'div' : PerfectScrollbar

  return (
    <ScrollWrapper
      {...(isBreakpointReached
        ? {
            className: 'bs-full overflow-y-auto overflow-x-hidden',
            onScroll: container => scrollMenu(container, false)
          }
        : {
            options: { wheelPropagation: false, suppressScrollX: true },
            onScrollY: container => scrollMenu(container, true)
          })}
    >
      <Menu
        popoutMenuOffset={{ mainAxis: 23 }}
        menuItemStyles={menuItemStyles(verticalNavOptions, theme)}
        renderExpandIcon={({ open }) => <RenderExpandIcon open={open} transitionDuration={transitionDuration} />}
        renderExpandedMenuItemIcon={{ icon: <i className='tabler-circle text-xs' /> }}
        menuSectionStyles={menuSectionStyles(verticalNavOptions, theme)}
      >
        <MenuSection label='Jelajahi'>
          <MenuItem href='/store' icon={<i className='tabler-building-store' />}>
            Toko
          </MenuItem>
          <MenuItem href='/subscribe' icon={<i className='tabler-crown' />}>
            Premium
          </MenuItem>
          <MenuItem href='/reviews' icon={<i className='tabler-message-star' />}>
            Review
          </MenuItem>
          {user && (
            <>
              <MenuItem href='/my-games' icon={<i className='tabler-device-gamepad-2' />}>
                Game Saya
              </MenuItem>
              <MenuItem href='/request-game' icon={<i className='tabler-bulb' />}>
                Request Game
              </MenuItem>
              <MenuItem href='/orders' icon={<i className='tabler-receipt' />}>
                Riwayat Pesanan
              </MenuItem>
              <MenuItem href='/referrals' icon={<i className='tabler-share' />}>
                Referral Saya
              </MenuItem>
              <MenuItem href='/promos' icon={<i className='tabler-discount' />}>
                Promo Saya
              </MenuItem>
              <MenuItem
                href={waSupportUrl}
                target='_blank'
                rel='noopener noreferrer'
                icon={<i className='tabler-brand-whatsapp' />}
              >
                Bantuan
              </MenuItem>
            </>
          )}
        </MenuSection>
        {!user && (
          <MenuSection label='Akun'>
            <Box sx={{ px: 4, py: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button component={Link} href='/login' variant='outlined' fullWidth size='small' startIcon={<i className='tabler-login' />}>
                Masuk
              </Button>
              <Button component={Link} href='/register' variant='contained' fullWidth size='small' startIcon={<i className='tabler-user-plus' />}>
                Daftar
              </Button>
            </Box>
          </MenuSection>
        )}
        {isAdmin && (
          <MenuSection label='Administrasi'>
            <MenuItem href='/admin' icon={<i className='tabler-dashboard' />}>
              Dashboard
            </MenuItem>
            <SubMenu label='Pelanggan' icon={<i className='tabler-users' />}>
              <MenuItem href='/admin/orders' icon={<i className='tabler-receipt' />}>
                Pesanan
              </MenuItem>
              <MenuItem href='/admin/users' icon={<i className='tabler-user' />}>
                Pengguna
              </MenuItem>
              <MenuItem href='/admin/subscriptions' icon={<i className='tabler-crown' />}>
                Langganan
              </MenuItem>
              <MenuItem href='/admin/reviews' icon={<i className='tabler-message-star' />}>
                Reviews
              </MenuItem>
            </SubMenu>
            <SubMenu label='Katalog & Akun' icon={<i className='tabler-device-gamepad-2' />}>
              <MenuItem href='/admin/games' icon={<i className='tabler-device-gamepad' />}>
                Game
              </MenuItem>
              <MenuItem href='/admin/accounts' icon={<i className='tabler-server' />}>
                Akun Steam
              </MenuItem>
              <MenuItem href='/admin/game-requests' icon={<i className='tabler-bulb' />}>
                Game Requests
              </MenuItem>
              <MenuItem href='/admin/account-flags' icon={<i className='tabler-flag' />}>
                Account Flags
              </MenuItem>
              <MenuItem href='/admin/refill-priority' icon={<i className='tabler-trending-up' />}>
                Refill Priority
              </MenuItem>
            </SubMenu>
            <SubMenu label='Marketing' icon={<i className='tabler-rocket' />}>
              <MenuItem href='/admin/promo-codes' icon={<i className='tabler-discount' />}>
                Promo Codes
              </MenuItem>
              <MenuItem href='/admin/referrals' icon={<i className='tabler-share' />}>
                Referrals
              </MenuItem>
              <MenuItem href='/admin/revenue-sharing' icon={<i className='tabler-coins' />}>
                Revenue Sharing
              </MenuItem>
              <MenuItem href='/admin/email-blast' icon={<i className='tabler-mail-fast' />}>
                Email Blast
              </MenuItem>
              <MenuItem href='/admin/creator-applications' icon={<i className='tabler-user-star' />}>
                Creator Applications
              </MenuItem>
            </SubMenu>
            <SubMenu label='Sistem' icon={<i className='tabler-settings' />}>
              <MenuItem href='/admin/reports' icon={<i className='tabler-report-money' />}>
                Laporan Transaksi
              </MenuItem>
              <MenuItem href='/admin/audit' icon={<i className='tabler-file-search' />}>
                Log Audit
              </MenuItem>
              <MenuItem href='/admin/settings' icon={<i className='tabler-settings-2' />}>
                Settings
              </MenuItem>
            </SubMenu>
          </MenuSection>
        )}
      </Menu>
    </ScrollWrapper>
  )
}

export default VerticalMenu
