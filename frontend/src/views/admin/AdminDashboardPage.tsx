'use client'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'

import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

interface StatCardProps {
  title: string
  value: number | string
  icon: string
  color: string
}

const StatCard = ({ title, value, icon, color }: StatCardProps) => (
  <Card>
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 3, p: 4 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: 2,
          bgcolor: `${color}.lightOpacity`,
          color: `${color}.main`
        }}
      >
        <i className={icon} style={{ fontSize: 28 }} />
      </Box>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          {title}
        </Typography>
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

  if (user?.role !== 'admin') {
    return <Alert severity='error'>Access denied. Admin role required.</Alert>
  }

  if (isLoading) {
    return (
      <div className='flex flex-col gap-6'>
        <Grid container spacing={4}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant='rectangular' height={100} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant='rectangular' height={300} sx={{ borderRadius: 1 }} />
      </div>
    )
  }

  if (error) {
    return <Alert severity='error'>Failed to load dashboard data</Alert>
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>
          Admin Dashboard
        </Typography>
        <Typography color='text.secondary'>
          Overview of platform statistics
        </Typography>
      </Box>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title='Steam Accounts' value={data?.total_accounts ?? 0} icon='tabler-users' color='primary' />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title='Total Games' value={data?.total_games ?? 0} icon='tabler-device-gamepad' color='info' />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title='Total Orders' value={data?.total_orders ?? 0} icon='tabler-receipt' color='success' />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title='Total Users' value={data?.total_users ?? 0} icon='tabler-user-circle' color='warning' />
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant='h6' sx={{ mb: 3 }}>
            Recent Orders
          </Typography>
          {data?.recent_orders && data.recent_orders.length > 0 ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Game</TableCell>
                    <TableCell>Account</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.recent_orders.map(order => (
                    <TableRow key={order.id} hover sx={{ cursor: 'pointer' }} onClick={() => router.push('/admin/orders')}>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>{order.user_email || `User #${order.user_id}`}</TableCell>
                      <TableCell>{order.game_name}</TableCell>
                      <TableCell>
                        <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                          {order.account_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {new Date(order.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell>
                        <Chip size='small' label={order.status || 'Active'} color='success' variant='tonal' />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color='text.secondary' sx={{ textAlign: 'center', py: 4 }}>
              No recent orders
            </Typography>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminDashboardPage
