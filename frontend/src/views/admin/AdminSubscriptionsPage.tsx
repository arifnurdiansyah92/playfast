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

import { adminApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  active: 'success',
  pending_payment: 'warning',
  expired: 'error',
  cancelled: 'info',
}

const AdminSubscriptionsPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [snackMsg, setSnackMsg] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

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

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminSubscriptionsPage
