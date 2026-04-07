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
          {data?.total_orders && data.total_orders > 0 ? (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography color='text.secondary' sx={{ mb: 2 }}>
                {data.fulfilled_orders} fulfilled / {data.total_orders} total orders
              </Typography>
              <Button variant='outlined' onClick={() => router.push('/admin/orders')}>
                View All Orders
              </Button>
            </Box>
          ) : (
            <Typography color='text.secondary' sx={{ textAlign: 'center', py: 4 }}>
              No orders yet
            </Typography>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default AdminDashboardPage
