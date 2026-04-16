'use client'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

import { adminApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: string
  color: string
  onClick?: () => void
}

const StatCard = ({ title, value, subtitle, icon, color, onClick }: StatCardProps) => (
  <Card sx={{ cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { borderColor: `${color}.main`, borderWidth: 1, borderStyle: 'solid' } : {} }} onClick={onClick}>
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 3, p: 3 }}>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: 2,
          bgcolor: `${color}.lightOpacity`, color: `${color}.main`
        }}
      >
        <i className={icon} style={{ fontSize: 26 }} />
      </Box>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700 }}>{value}</Typography>
        <Typography variant='body2' color='text.secondary'>{title}</Typography>
        {subtitle && <Typography variant='caption' color='text.secondary'>{subtitle}</Typography>}
      </Box>
    </CardContent>
  </Card>
)

const AdminDashboardPage = () => {
  const { user } = useAuth()
  const router = useRouter()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => adminApi.getDashboard(),
    enabled: user?.role === 'admin'
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied. Admin role required.</Alert>

  if (isLoading) {
    return (
      <div className='flex flex-col gap-6'>
        <Grid container spacing={3}>{Array.from({ length: 6 }).map((_, i) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}><Skeleton variant='rectangular' height={90} sx={{ borderRadius: 1 }} /></Grid>
        ))}</Grid>
      </div>
    )
  }

  if (error) return <Alert severity='error'>Failed to load dashboard data</Alert>

  const statusColor = (status: string) => {
    if (status === 'revoked') return 'error'
    if (status === 'fulfilled') return 'success'
    return 'default'
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 0.5 }}>Dashboard</Typography>
          <Typography color='text.secondary'>Platform overview</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant='outlined' size='small' startIcon={<i className='tabler-plus' />} onClick={() => router.push('/admin/accounts')}>
            Add Account
          </Button>
          <Button variant='outlined' size='small' startIcon={<i className='tabler-users' />} onClick={() => router.push('/admin/users')}>
            Users
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title='Steam Accounts'
            value={data?.total_accounts ?? 0}
            subtitle={`${data?.active_accounts ?? 0} active`}
            icon='tabler-server'
            color='primary'
            onClick={() => router.push('/admin/accounts')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title='Games'
            value={data?.total_games ?? 0}
            subtitle={`${data?.enabled_games ?? 0} enabled · ${data?.featured_games ?? 0} featured`}
            icon='tabler-device-gamepad'
            color='info'
            onClick={() => router.push('/admin/games')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title='Orders'
            value={data?.total_orders ?? 0}
            subtitle={`${data?.fulfilled_orders ?? 0} fulfilled · ${data?.revoked_orders ?? 0} revoked`}
            icon='tabler-receipt'
            color='success'
            onClick={() => router.push('/admin/orders')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title='Users'
            value={data?.total_users ?? 0}
            icon='tabler-user-circle'
            color='warning'
            onClick={() => router.push('/admin/users')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            title='Total Revenue'
            value={formatIDR(data?.revenue_total ?? 0)}
            subtitle='From fulfilled orders'
            icon='tabler-currency-dollar'
            color='success'
          />
        </Grid>
      </Grid>

      {/* Top Games & Order Trend */}
      <Grid container spacing={3}>
        {/* Top Games */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant='h6' sx={{ mb: 2 }}>Top Games</Typography>
              {data?.top_games && data.top_games.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {(() => {
                    const maxCount = Math.max(...data.top_games.map(g => g.order_count))
                    return data.top_games.map((game, i) => (
                      <Box key={game.appid} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant='caption' color='text.secondary' sx={{ minWidth: 18, textAlign: 'right' }}>
                          {i + 1}.
                        </Typography>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant='body2' noWrap sx={{ mb: 0.5 }}>{game.name}</Typography>
                          <Box sx={{ width: '100%', bgcolor: 'action.hover', borderRadius: 1, height: 8, overflow: 'hidden' }}>
                            <Box
                              sx={{
                                width: `${(game.order_count / maxCount) * 100}%`,
                                height: '100%',
                                bgcolor: 'primary.main',
                                borderRadius: 1,
                                transition: 'width 0.5s ease',
                              }}
                            />
                          </Box>
                        </Box>
                        <Typography variant='body2' sx={{ fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
                          {game.order_count}
                        </Typography>
                      </Box>
                    ))
                  })()}
                </Box>
              ) : (
                <Typography color='text.secondary' sx={{ textAlign: 'center', py: 4 }}>No order data yet</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Order Trend */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant='h6' sx={{ mb: 2 }}>Order Trend (14 days)</Typography>
              {data?.order_trend && data.order_trend.length > 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: 160, pt: 2 }}>
                  {(() => {
                    const maxCount = Math.max(...data.order_trend.map(d => d.count), 1)
                    return data.order_trend.map(day => {
                      const barHeight = Math.max((day.count / maxCount) * 120, 4)
                      const dateObj = new Date(day.date)
                      const label = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                      return (
                        <Box
                          key={day.date}
                          sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            height: '100%',
                          }}
                        >
                          <Typography variant='caption' sx={{ fontWeight: 600, mb: 0.5, fontSize: '0.65rem' }}>
                            {day.count}
                          </Typography>
                          <Box
                            sx={{
                              width: '100%',
                              maxWidth: 36,
                              height: barHeight,
                              bgcolor: 'primary.main',
                              borderRadius: '4px 4px 0 0',
                              transition: 'height 0.5s ease',
                              opacity: 0.85,
                              '&:hover': { opacity: 1 },
                            }}
                          />
                          <Typography
                            variant='caption'
                            color='text.secondary'
                            sx={{
                              mt: 0.5,
                              fontSize: '0.6rem',
                              writingMode: 'vertical-rl',
                              textOrientation: 'mixed',
                              height: 36,
                              overflow: 'hidden',
                            }}
                          >
                            {label}
                          </Typography>
                        </Box>
                      )
                    })
                  })()}
                </Box>
              ) : (
                <Typography color='text.secondary' sx={{ textAlign: 'center', py: 4 }}>No order data yet</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Orders */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant='h6'>Recent Orders</Typography>
            <Button size='small' onClick={() => router.push('/admin/orders')}>View All</Button>
          </Box>
          {data?.recent_orders && data.recent_orders.length > 0 ? (
            <TableContainer>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Game</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.recent_orders.map(order => (
                    <TableRow key={order.id} hover sx={{ cursor: 'pointer' }} onClick={() => router.push('/admin/orders')}>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>{order.user_email || `User #${order.user_id}`}</TableCell>
                      <TableCell>{order.game?.name}</TableCell>
                      <TableCell><Chip size='small' label={order.status} color={statusColor(order.status)} variant='tonal' /></TableCell>
                      <TableCell>{new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color='text.secondary' sx={{ textAlign: 'center', py: 4 }}>No orders yet</Typography>
          )}
        </CardContent>
      </Card>

      {/* Recent Code Requests */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant='h6'>Recent Code Requests</Typography>
            <Button size='small' onClick={() => router.push('/admin/audit')}>View All</Button>
          </Box>
          {data?.recent_codes && data.recent_codes.length > 0 ? (
            <TableContainer>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Account</TableCell>
                    <TableCell>Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.recent_codes.map(entry => (
                    <TableRow key={entry.id} hover>
                      <TableCell>{entry.user_email}</TableCell>
                      <TableCell><Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{entry.account_name}</Typography></TableCell>
                      <TableCell>{new Date(entry.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color='text.secondary' sx={{ textAlign: 'center', py: 4 }}>No code requests yet</Typography>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminDashboardPage
