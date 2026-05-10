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
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Tooltip from '@mui/material/Tooltip'

import { adminApi, gameThumbnail, handleImageError } from '@/lib/api'
import type { Order } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminOrdersPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [snackMsg, setSnackMsg] = useState('')
  const [rotateOrder, setRotateOrder] = useState<Order | null>(null)

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

  const confirmMutation = useMutation({
    mutationFn: (orderId: number) => adminApi.confirmManualPayment(orderId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-orders'] }); setSnackMsg('Payment confirmed & order fulfilled') }
  })

  const retryFulfillMutation = useMutation({
    mutationFn: (orderId: number) => adminApi.retryFulfillOrder(orderId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-orders'] }); setSnackMsg('Order re-fulfilled — account assigned') },
    onError: (err: any) => setSnackMsg(err?.message || 'Retry failed'),
  })

  const retryFulfillAllMutation = useMutation({
    mutationFn: () => adminApi.retryFulfillAllOrders(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      const healed = res.healed.length
      const failed = res.failed.length

      if (res.scanned === 0) setSnackMsg('No unassigned orders found')
      else if (failed === 0) setSnackMsg(`Healed ${healed} order(s)`)
      else setSnackMsg(`Healed ${healed}, ${failed} still need accounts`)
    },
    onError: (err: any) => setSnackMsg(err?.message || 'Bulk retry failed'),
  })

  const reassignMutation = useMutation({
    mutationFn: ({ orderId, accountId }: { orderId: number; accountId: number }) =>
      adminApi.reassignOrder(orderId, accountId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      setSnackMsg(res.message || 'Order reassigned')
      setRotateOrder(null)
    },
    onError: (err: any) => setSnackMsg(err?.message || 'Reassign failed'),
  })

  const unassignedCount = orders?.filter(o => o.status === 'fulfilled' && !o.credentials && !o.is_revoked).length ?? 0

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

    if (statusFilter === 'unassigned') {
      // "unassigned" is a pseudo-status: fulfilled order whose Steam account
      // assignment was lost (initial fulfillment failed, account disabled,
      // or family-share pruned). Bookkeeping-wise these orders are still
      // status='fulfilled' so we filter on the derived condition instead.
      result = result.filter(o => o.status === 'fulfilled' && !o.credentials && !o.is_revoked)
    } else if (statusFilter) {
      result = result.filter(o => o.status === statusFilter)
    }

    return result
  }, [orders, search, statusFilter])

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const statusColor = (status: string) => {
    if (status === 'revoked' || status === 'cancelled') return 'error' as const
    if (status === 'fulfilled') return 'success' as const
    if (status === 'pending_payment') return 'warning' as const
    
return 'default' as const
  }

  const pendingCount = orders?.filter(o => o.status === 'pending_payment').length ?? 0
  const fulfilledCount = orders?.filter(o => o.status === 'fulfilled').length ?? 0
  const revokedCount = orders?.filter(o => o.status === 'revoked').length ?? 0

  const statuses: { label: string; value: string; count: number; color?: 'primary' | 'warning' | 'success' | 'error' }[] = [
    { label: 'All', value: '', count: orders?.length ?? 0 },
    { label: 'Pending', value: 'pending_payment', count: pendingCount },
    { label: 'Fulfilled', value: 'fulfilled', count: fulfilledCount },
    { label: 'Unassigned', value: 'unassigned', count: unassignedCount, color: 'warning' },
    { label: 'Revoked', value: 'revoked', count: revokedCount, color: 'error' },
  ]

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 1 }}>Orders</Typography>
          <Typography color='text.secondary'>{orders?.length ?? 0} total orders</Typography>
        </Box>
        {unassignedCount > 0 && (
          <Button
            variant='contained'
            color='warning'
            startIcon={<i className={retryFulfillAllMutation.isPending ? 'tabler-loader-2' : 'tabler-refresh'} />}
            onClick={() => retryFulfillAllMutation.mutate()}
            disabled={retryFulfillAllMutation.isPending}
            sx={{ fontWeight: 700 }}
          >
            {retryFulfillAllMutation.isPending ? 'Assigning...' : `Auto-Assign ${unassignedCount} Unassigned`}
          </Button>
        )}
      </Box>

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {statuses.map(s => (
          <Chip
            key={s.value}
            label={`${s.label} (${s.count})`}
            variant={statusFilter === s.value ? 'filled' : 'outlined'}
            color={statusFilter === s.value ? (s.color ?? 'primary') : 'default'}
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
                        <Box component='img' src={order.game?.appid ? gameThumbnail(order.game.appid) : ''} alt='' sx={{ width: 48, height: 18, borderRadius: 0.5, objectFit: 'cover' }} onError={handleImageError} />
                        <Typography variant='subtitle2'>{order.game?.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {order.credentials?.account_name ? (
                        <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{order.credentials.account_name}</Typography>
                      ) : order.status === 'fulfilled' && !order.is_revoked ? (
                        <Chip size='small' color='warning' variant='tonal' label='unassigned' />
                      ) : (
                        <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>-</Typography>
                      )}
                    </TableCell>
                    <TableCell>{new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</TableCell>
                    <TableCell><Chip size='small' label={order.status} color={statusColor(order.status)} variant='tonal' /></TableCell>
                    <TableCell align='right'>
                      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {order.status === 'pending_payment' ? (
                          <Button size='small' variant='contained' color='success' onClick={() => confirmMutation.mutate(order.id)} disabled={confirmMutation.isPending}>
                            Confirm Payment
                          </Button>
                        ) : order.is_revoked ? (
                          <Button size='small' variant='outlined' color='success' onClick={() => restoreMutation.mutate(order.id)} disabled={restoreMutation.isPending}>Restore</Button>
                        ) : order.status === 'fulfilled' && !order.credentials ? (
                          <Button size='small' variant='contained' color='warning' onClick={() => retryFulfillMutation.mutate(order.id)} disabled={retryFulfillMutation.isPending}>
                            Retry Assign
                          </Button>
                        ) : order.status === 'fulfilled' ? (
                          <Button size='small' variant='outlined' color='error' onClick={() => revokeMutation.mutate(order.id)} disabled={revokeMutation.isPending}>Revoke</Button>
                        ) : null}
                        {order.status === 'fulfilled' && !order.is_revoked && (
                          <Tooltip title='Rotasi ke akun lain (mis. Denuvo activation limit)'>
                            <IconButton size='small' onClick={() => setRotateOrder(order)}>
                              <i className='tabler-arrows-shuffle' style={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <RotateDialog
        order={rotateOrder}
        onClose={() => setRotateOrder(null)}
        onPick={(accountId) =>
          rotateOrder && reassignMutation.mutate({ orderId: rotateOrder.id, accountId })
        }
        isPending={reassignMutation.isPending}
      />

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

interface RotateDialogProps {
  order: Order | null
  onClose: () => void
  onPick: (accountId: number) => void
  isPending: boolean
}

const RotateDialog = ({ order, onClose, onPick, isPending }: RotateDialogProps) => {
  const open = !!order

  const { data, isLoading } = useQuery({
    queryKey: ['admin-order-candidates', order?.id],
    queryFn: () => adminApi.getOrderCandidateAccounts(order!.id),
    enabled: open && !!order,
  })

  const candidates = data?.candidates ?? []
  const otherCandidates = candidates.filter(c => !c.is_current)

  const currentAccountName =
    candidates.find(c => c.is_current)?.account_name ||
    order?.credentials?.account_name ||
    '-'

  return (
    <Dialog open={open} onClose={() => !isPending && onClose()} maxWidth='sm' fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <i className='tabler-arrows-shuffle' />
        Rotate Account — Order #{order?.id}
      </DialogTitle>
      <DialogContent>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          Game: <strong>{order?.game?.name}</strong> · Saat ini: <strong>{currentAccountName}</strong>
        </Typography>

        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={48} />)}
          </Box>
        ) : otherCandidates.length === 0 ? (
          <Alert severity='info'>
            Tidak ada akun aktif lain yang punya game ini. Tambahkan akun baru atau aktifkan akun yang ada untuk membuka opsi rotate.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant='caption' color='text.secondary' sx={{ mb: 0.5 }}>
              Pilih akun tujuan. Angka users = berapa user lain yang sedang aktif pakai pasangan account+game ini (proxy buat Denuvo activation slot).
            </Typography>
            {otherCandidates.map(c => (
              <Card key={c.id} variant='outlined'>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant='subtitle2' sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {c.account_name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                      {c.steam_id && (
                        <Typography variant='caption' color='text.secondary' sx={{ fontFamily: 'monospace' }}>
                          {c.steam_id}
                        </Typography>
                      )}
                      <Chip size='small' label={`${c.active_assignment_count} user${c.active_assignment_count === 1 ? '' : 's'}`} variant='tonal' color={c.active_assignment_count === 0 ? 'success' : c.active_assignment_count < 3 ? 'info' : 'warning'} sx={{ height: 20, fontSize: '0.7rem' }} />
                      {c.is_shared && (
                        <Chip size='small' label='shared' variant='tonal' color='default' sx={{ height: 20, fontSize: '0.7rem' }} />
                      )}
                    </Box>
                  </Box>
                  <Button
                    variant='contained'
                    size='small'
                    onClick={() => onPick(c.id)}
                    disabled={isPending}
                  >
                    Reassign
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending}>Tutup</Button>
      </DialogActions>
    </Dialog>
  )
}

export default AdminOrdersPage
