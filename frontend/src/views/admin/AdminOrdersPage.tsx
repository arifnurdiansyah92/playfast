'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminOrdersPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => adminApi.getOrders(),
    enabled: user?.role === 'admin'
  })

  const revokeMutation = useMutation({
    mutationFn: (orderId: number) => adminApi.revokeAccess(orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
  })

  const restoreMutation = useMutation({
    mutationFn: (orderId: number) => adminApi.restoreAccess(orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
  })

  if (user?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  const statusColor = (status: string) => {
    if (status === 'revoked') return 'error'
    if (status === 'fulfilled') return 'success'
    return 'default'
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>
          Orders
        </Typography>
        <Typography color='text.secondary'>
          All user orders across the platform
        </Typography>
      </Box>

      {isLoading ? (
        <Card>
          <CardContent>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={60} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        </Card>
      ) : !orders || orders.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-receipt' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              No orders yet
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
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
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map(order => (
                  <TableRow key={order.id} hover>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontWeight: 600 }}>
                        #{order.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>
                        {order.user_email || `User #${order.user_id}`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box
                          component='img'
                          src={`https://cdn.akamai.steamstatic.com/steam/apps/${order.game?.appid}/capsule_sm_120.jpg`}
                          alt={order.game?.name}
                          sx={{ width: 48, height: 18, borderRadius: 0.5, objectFit: 'cover' }}
                          onError={(e: any) => { e.target.style.display = 'none' }}
                        />
                        <Typography variant='subtitle2'>{order.game?.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                        {order.credentials?.account_name || '-'}
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
                      <Chip
                        size='small'
                        label={order.status}
                        color={statusColor(order.status)}
                        variant='tonal'
                      />
                    </TableCell>
                    <TableCell align='right'>
                      {order.is_revoked ? (
                        <Button
                          size='small'
                          variant='outlined'
                          color='success'
                          onClick={() => restoreMutation.mutate(order.id)}
                          disabled={restoreMutation.isPending}
                        >
                          Restore
                        </Button>
                      ) : order.status === 'fulfilled' ? (
                        <Button
                          size='small'
                          variant='outlined'
                          color='error'
                          onClick={() => revokeMutation.mutate(order.id)}
                          disabled={revokeMutation.isPending}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </div>
  )
}

export default AdminOrdersPage
