'use client'

import { useState, useMemo } from 'react'

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
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Grid from '@mui/material/Grid'

import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminOrdersPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [snackMsg, setSnackMsg] = useState('')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => adminApi.getOrders(),
    enabled: user?.role === 'admin'
  })

  const revokeMutation = useMutation({
    mutationFn: (orderId: number) => adminApi.revokeAccess(orderId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-orders'] }); setSnackMsg('Access revoked') }
  })

  const restoreMutation = useMutation({
    mutationFn: (orderId: number) => adminApi.restoreAccess(orderId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-orders'] }); setSnackMsg('Access restored') }
  })

  const filtered = useMemo(() => {
    if (!orders) return []
    let result = orders
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        (o.user_email || '').toLowerCase().includes(q) ||
        (o.game?.name || '').toLowerCase().includes(q) ||
        (o.credentials?.account_name || '').toLowerCase().includes(q) ||
        String(o.id).includes(q)
      )
    }
    if (statusFilter) result = result.filter(o => o.status === statusFilter)
    return result
  }, [orders, search, statusFilter])

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const statusColor = (status: string) => {
    if (status === 'revoked') return 'error' as const
    if (status === 'fulfilled') return 'success' as const
    return 'default' as const
  }

  const fulfilledCount = orders?.filter(o => o.status === 'fulfilled').length ?? 0
  const revokedCount = orders?.filter(o => o.status === 'revoked').length ?? 0

  const statuses = [
    { label: 'All', value: '', count: orders?.length ?? 0 },
    { label: 'Fulfilled', value: 'fulfilled', count: fulfilledCount },
    { label: 'Revoked', value: 'revoked', count: revokedCount },
  ]

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 1 }}>Orders</Typography>
          <Typography color='text.secondary'>{orders?.length ?? 0} total orders</Typography>
        </Box>
      </Box>

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <Chip
            key={s.value}
            label={`${s.label} (${s.count})`}
            variant={statusFilter === s.value ? 'filled' : 'outlined'}
            color={statusFilter === s.value ? 'primary' : 'default'}
            onClick={() => setStatusFilter(statusFilter === s.value ? '' : s.value)}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Box>

      {/* Search */}
      <TextField
        fullWidth size='small'
        placeholder='Search by user email, game name, account, or order ID...'
        value={search}
        onChange={e => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position='start'><i className='tabler-search' /></InputAdornment>,
            endAdornment: search ? <InputAdornment position='end'><IconButton size='small' onClick={() => setSearch('')}><i className='tabler-x' /></IconButton></InputAdornment> : null,
          }
        }}
      />

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={60} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-receipt' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>{orders?.length === 0 ? 'No orders yet' : 'No matching orders'}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
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
                {filtered.map(order => (
                  <TableRow key={order.id} hover>
                    <TableCell><Typography variant='body2' sx={{ fontWeight: 600 }}>#{order.id}</Typography></TableCell>
                    <TableCell><Typography variant='body2'>{order.user_email || `User #${order.user_id}`}</Typography></TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box component='img' src={`https://cdn.akamai.steamstatic.com/steam/apps/${order.game?.appid}/capsule_sm_120.jpg`} alt='' sx={{ width: 48, height: 18, borderRadius: 0.5, objectFit: 'cover' }} onError={(e: any) => { e.target.style.display = 'none' }} />
                        <Typography variant='subtitle2'>{order.game?.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{order.credentials?.account_name || '-'}</Typography></TableCell>
                    <TableCell>{new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                    <TableCell><Chip size='small' label={order.status} color={statusColor(order.status)} variant='tonal' /></TableCell>
                    <TableCell align='right'>
                      {order.is_revoked ? (
                        <Button size='small' variant='outlined' color='success' onClick={() => restoreMutation.mutate(order.id)} disabled={restoreMutation.isPending}>Restore</Button>
                      ) : order.status === 'fulfilled' ? (
                        <Button size='small' variant='outlined' color='error' onClick={() => revokeMutation.mutate(order.id)} disabled={revokeMutation.isPending}>Revoke</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminOrdersPage
