// MUI Imports
import { useTheme } from '@mui/material/styles'

// Type Imports
import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu'

// Component Imports
import HorizontalNav, { Menu, MenuItem, SubMenu } from '@menu/horizontal-menu'
import VerticalNavContent from './VerticalNavContent'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Styled Component Imports
import StyledHorizontalNavExpandIcon from '@menu/styles/horizontal/StyledHorizontalNavExpandIcon'
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/horizontal/menuItemStyles'
import menuRootStyles from '@core/styles/horizontal/menuRootStyles'
import verticalNavigationCustomStyles from '@core/styles/vertical/navigationCustomStyles'
import verticalMenuItemStyles from '@core/styles/vertical/menuItemStyles'
import verticalMenuSectionStyles from '@core/styles/vertical/menuSectionStyles'

// Context Imports
import { useAuth } from '@/contexts/AuthContext'
import { useWhatsappNumber } from '@/hooks/useWhatsappNumber'

type RenderExpandIconProps = {
  level?: number
}

type RenderVerticalExpandIconProps = {
  open?: boolean
  transitionDuration?: VerticalMenuContextProps['transitionDuration']
}

const RenderExpandIcon = ({ level }: RenderExpandIconProps) => (
  <StyledHorizontalNavExpandIcon level={level}>
    <i className='tabler-chevron-right' />
  </StyledHorizontalNavExpandIcon>
)

const RenderVerticalExpandIcon = ({ open, transitionDuration }: RenderVerticalExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='tabler-chevron-right' />
  </StyledVerticalNavExpandIcon>
)

const HorizontalMenu = () => {
  // Hooks
  const verticalNavOptions = useVerticalNav()
  const theme = useTheme()
  const { user } = useAuth()
  const waNumber = useWhatsappNumber()
  const waSupportUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent('Halo Playfast, saya butuh bantuan.')}`

  // Vars
  const { transitionDuration } = verticalNavOptions
  const isAdmin = user?.role === 'admin'

  return (
    <HorizontalNav
      switchToVertical
      verticalNavContent={VerticalNavContent}
      verticalNavProps={{
        customStyles: verticalNavigationCustomStyles(verticalNavOptions, theme),
        backgroundColor: 'var(--mui-palette-background-paper)'
      }}
    >
      <Menu
        rootStyles={menuRootStyles(theme)}
        renderExpandIcon={({ level }) => <RenderExpandIcon level={level} />}
        menuItemStyles={menuItemStyles(theme, 'tabler-circle')}
        renderExpandedMenuItemIcon={{ icon: <i className='tabler-circle text-xs' /> }}
        popoutMenuOffset={{
          mainAxis: ({ level }) => (level && level > 0 ? 14 : 12),
          alignmentAxis: 0
        }}
        verticalMenuProps={{
          menuItemStyles: verticalMenuItemStyles(verticalNavOptions, theme),
          renderExpandIcon: ({ open }) => (
            <RenderVerticalExpandIcon open={open} transitionDuration={transitionDuration} />
          ),
          renderExpandedMenuItemIcon: { icon: <i className='tabler-circle text-xs' /> },
          menuSectionStyles: verticalMenuSectionStyles(verticalNavOptions, theme)
        }}
      >
        <MenuItem href='/store' icon={<i className='tabler-building-store' />}>
          Toko
        </MenuItem>
        <MenuItem href='/my-games' icon={<i className='tabler-device-gamepad-2' />}>
          Game Saya
        </MenuItem>
        <MenuItem href='/request-game' icon={<i className='tabler-bulb' />}>
          Request Game
        </MenuItem>
        <MenuItem href='/referrals' icon={<i className='tabler-share' />}>
          Referral Saya
        </MenuItem>
        <MenuItem href='/promos' icon={<i className='tabler-discount' />}>
          Promo Saya
        </MenuItem>
        {user && (
          <MenuItem
            href={waSupportUrl}
            target='_blank'
            rel='noopener noreferrer'
            icon={<i className='tabler-brand-whatsapp' />}
          >
            Bantuan
          </MenuItem>
        )}
        {isAdmin && (
          <SubMenu label='Admin' icon={<i className='tabler-shield' />}>
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
              <MenuItem href='/admin/email-logs' icon={<i className='tabler-mail-search' />}>
                Email Logs
              </MenuItem>
              <MenuItem href='/admin/settings' icon={<i className='tabler-settings-2' />}>
                Settings
              </MenuItem>
            </SubMenu>
          </SubMenu>
        )}
      </Menu>
    </HorizontalNav>
  )
}

export default HorizontalMenu
