'use client'

import { useState } from 'react'

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
import Snackbar from '@mui/material/Snackbar'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'

import { adminApi, formatIDR } from '@/lib/api'
import type { Subscription } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  active: 'success',
  pending_payment: 'warning',
  expired: 'error',
  cancelled: 'info',
  refunded: 'info',
}

const AdminSubscriptionsPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [snackMsg, setSnackMsg] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [refundSub, setRefundSub] = useState<Subscription | null>(null)
  const [refundNote, setRefundNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscriptions', statusFilter, page],
    queryFn: () => adminApi.getSubscriptions({ status: statusFilter || undefined, page }),
    enabled: user?.role === 'admin',
  })

  const confirmMutation = useMutation({
    mutationFn: (id: number) => adminApi.confirmSubscription(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      setSnackMsg(res.message)
    },
    onError: (err: any) => setSnackMsg(`Failed: ${err.message}`),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: number) => adminApi.revokeSubscription(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      setSnackMsg(res.message)
    },
    onError: (err: any) => setSnackMsg(`Failed: ${err.message}`),
  })

  const refundMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => adminApi.refundSubscription(id, note),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      const revokedNote = res.revoked_claim_count > 0 ? ` — ${res.revoked_claim_count} game claim revoked` : ''

      setSnackMsg(`${res.message}${revokedNote}`)
      setRefundSub(null)
      setRefundNote('')
    },
    onError: (err: any) => setSnackMsg(`Refund failed: ${err.message}`),
  })

  const subs = data?.subscriptions ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 1 }}>Subscriptions</Typography>
          <Typography color='text.secondary'>{total} subscriptions</Typography>
        </Box>
      </Box>

      <Card>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size='small' sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label='Status' onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
              <MenuItem value=''>All</MenuItem>
              <MenuItem value='active'>Active</MenuItem>
              <MenuItem value='pending_payment'>Pending</MenuItem>
              <MenuItem value='expired'>Expired</MenuItem>
              <MenuItem value='cancelled'>Cancelled</MenuItem>
              <MenuItem value='refunded'>Refunded</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={50} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : subs.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-crown' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>No subscriptions</Typography>
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
                  <TableCell>Plan</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Starts</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell>Paid</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {subs.map(sub => (
                  <TableRow key={sub.id} hover>
                    <TableCell><Typography variant='body2' sx={{ fontWeight: 600 }}>#{sub.id}</Typography></TableCell>
                    <TableCell>{sub.user_email}</TableCell>
                    <TableCell><Chip size='small' label={sub.plan_label} variant='tonal' /></TableCell>
                    <TableCell>
                      <Chip size='small' label={sub.status} color={statusColors[sub.status] ?? 'default'} variant='tonal' />
                    </TableCell>
                    <TableCell>{formatIDR(sub.amount)}</TableCell>
                    <TableCell>{sub.starts_at ? new Date(sub.starts_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                    <TableCell>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                    <TableCell>{sub.paid_at ? new Date(sub.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                    <TableCell align='right'>
                      {sub.status === 'pending_payment' && (
                        <Tooltip title='Confirm Payment'>
                          <IconButton
                            size='small'
                            color='success'
                            onClick={() => confirmMutation.mutate(sub.id)}
                            disabled={confirmMutation.isPending}
                          >
                            <i className='tabler-check' />
                          </IconButton>
                        </Tooltip>
                      )}
                      {(sub.status === 'active' || sub.status === 'pending_payment') && (
                        <Tooltip title={sub.status === 'active' ? 'Revoke (batalkan)' : 'Cancel pending payment'}>
                          <IconButton
                            size='small'
                            color='error'
                            onClick={() => {
                              const label = sub.status === 'active'
                                ? `Yakin revoke subscription #${sub.id} (${sub.plan_label}) milik ${sub.user_email}? Akses akan langsung hilang.`
                                : `Yakin batalkan pending payment #${sub.id} milik ${sub.user_email}?`

                              if (confirm(label)) revokeMutation.mutate(sub.id)
                            }}
                            disabled={revokeMutation.isPending}
                          >
                            <i className='tabler-ban' />
                          </IconButton>
                        </Tooltip>
                      )}
                      {(sub.status === 'active' || sub.status === 'expired' || sub.status === 'cancelled') && (
                        <Tooltip title='Refund subscription — expire + rollback promo/credit/referral + revoke claimed games'>
                          <IconButton
                            size='small'
                            color='info'
                            onClick={() => { setRefundSub(sub); setRefundNote('') }}
                          >
                            <i className='tabler-receipt-refund' />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color='primary' />
            </Box>
          )}
        </Card>
      )}

      <Dialog open={!!refundSub} onClose={() => { setRefundSub(null); setRefundNote('') }} maxWidth='sm' fullWidth>
        <DialogTitle>Refund Subscription #{refundSub?.id}</DialogTitle>
        <DialogContent>
          <Typography color='text.secondary' sx={{ mb: 2 }}>
            Refund <strong>{refundSub?.plan_label}</strong> milik <strong>{refundSub?.user_email}</strong> (dibayar {refundSub?.amount ? formatIDR(refundSub.amount) : '-'}).
          </Typography>
          <Alert severity='warning' sx={{ mb: 2 }}>
            Setelah refund: subscription langsung expired, semua game yang sudah diklaim via Premium ini direvoke, promo code di-rollback, referral credit & reward dikembalikan. Transfer uang manual di luar sistem.
          </Alert>
          <TextField
            fullWidth
            multiline
            rows={3}
            label='Catatan (opsional)'
            placeholder='Contoh: customer cancel karena salah pilih plan, transfer DANA 13 Mei'
            value={refundNote}
            onChange={e => setRefundNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRefundSub(null); setRefundNote('') }}>Batal</Button>
          <Button
            variant='contained'
            color='info'
            onClick={() => refundSub && refundMutation.mutate({ id: refundSub.id, note: refundNote })}
            disabled={refundMutation.isPending}
          >
            {refundMutation.isPending ? 'Memproses...' : 'Refund Subscription'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminSubscriptionsPage
