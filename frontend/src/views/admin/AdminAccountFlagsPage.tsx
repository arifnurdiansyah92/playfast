'use client'

import { useState } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Skeleton from '@mui/material/Skeleton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

import type { AccountFlag, AccountFlagReason } from '@/lib/api'
import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const REASON_LABELS: Record<AccountFlagReason, string> = {
  credentials_invalid: 'Username/password salah',
  guard_code_failed: 'Steam Guard ditolak',
  locked: 'Akun ke-lock',
  banned: 'Akun di-banned',
  password_changed: 'Password berubah',
  slow_response: 'Akun lambat',
  other: 'Lainnya',
}

const REASON_COLORS: Record<AccountFlagReason, 'error' | 'warning' | 'info' | 'default'> = {
  banned: 'error',
  locked: 'error',
  password_changed: 'warning',
  credentials_invalid: 'warning',
  guard_code_failed: 'warning',
  slow_response: 'info',
  other: 'default',
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const AdminAccountFlagsPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [statusTab, setStatusTab] = useState<'new' | 'resolved' | 'all'>('new')
  const [snackMsg, setSnackMsg] = useState('')
  const [resolveTarget, setResolveTarget] = useState<AccountFlag | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-account-flags', statusTab],
    queryFn: () => adminApi.getAccountFlags(statusTab),
    enabled: user?.role === 'admin',
  })

  const flags = data?.flags ?? []
  const counts = data?.counts ?? { new: 0, resolved: 0, all: 0 }

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => adminApi.resolveAccountFlag(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-account-flags'] })
      setSnackMsg('Flag marked as solved')
      setResolveTarget(null)
      setResolutionNote('')
    },
    onError: (err: any) => setSnackMsg(err?.message || 'Resolve failed'),
  })

  const reopenMutation = useMutation({
    mutationFn: (id: number) => adminApi.reopenAccountFlag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-account-flags'] })
      setSnackMsg('Flag reopened')
    },
    onError: (err: any) => setSnackMsg(err?.message || 'Reopen failed'),
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const tabs: { value: typeof statusTab; label: string; count: number }[] = [
    { value: 'new', label: 'New', count: counts.new },
    { value: 'resolved', label: 'Resolved', count: counts.resolved },
    { value: 'all', label: 'All', count: counts.all },
  ]

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Account Flags</Typography>
        <Typography color='text.secondary'>User-reported issues with assigned Steam accounts</Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <Chip
            key={t.value}
            label={`${t.label} (${t.count})`}
            variant={statusTab === t.value ? 'filled' : 'outlined'}
            color={statusTab === t.value ? (t.value === 'new' ? 'warning' : 'primary') : 'default'}
            onClick={() => setStatusTab(t.value)}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Box>

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={56} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : flags.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-flag-off' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              {statusTab === 'new' ? 'Tidak ada laporan baru' : 'Belum ada data'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Akun Steam</TableCell>
                  <TableCell>Game</TableCell>
                  <TableCell>Jenis</TableCell>
                  <TableCell>Detail</TableCell>
                  <TableCell>Tanggal</TableCell>
                  <TableCell align='right'>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {flags.map(flag => (
                  <TableRow key={flag.id} hover>
                    <TableCell>
                      <Chip
                        size='small'
                        label={flag.status === 'new' ? 'NEW' : 'Resolved'}
                        color={flag.status === 'new' ? 'warning' : 'success'}
                        variant={flag.status === 'new' ? 'filled' : 'tonal'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{flag.user_email || `User #${flag.user_id}`}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{flag.account_name || `Acc #${flag.steam_account_id}`}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{flag.game_name || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={REASON_LABELS[flag.reason]}
                        color={REASON_COLORS[flag.reason]}
                        variant='tonal'
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      {flag.description ? (
                        <Typography variant='caption' sx={{ whiteSpace: 'pre-wrap', display: 'block', color: 'text.secondary' }}>
                          {flag.description}
                        </Typography>
                      ) : (
                        <Typography variant='caption' color='text.disabled'>—</Typography>
                      )}
                      {flag.status === 'resolved' && flag.resolution_note && (
                        <Box sx={{ mt: 0.5, pt: 0.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                          <Typography variant='caption' color='success.main' sx={{ fontWeight: 600 }}>
                            Resolved by {flag.resolved_by_email}: {flag.resolution_note}
                          </Typography>
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant='caption' color='text.secondary' sx={{ whiteSpace: 'nowrap' }}>
                        {formatDate(flag.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align='right'>
                      {flag.status === 'new' ? (
                        <Button
                          size='small'
                          variant='contained'
                          color='success'
                          startIcon={<i className='tabler-check' />}
                          onClick={() => setResolveTarget(flag)}
                          disabled={resolveMutation.isPending}
                        >
                          Mark as Solved
                        </Button>
                      ) : (
                        <Button
                          size='small'
                          variant='outlined'
                          color='warning'
                          startIcon={<i className='tabler-rotate' />}
                          onClick={() => reopenMutation.mutate(flag.id)}
                          disabled={reopenMutation.isPending}
                        >
                          Reopen
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Resolve dialog */}
      <Dialog open={!!resolveTarget} onClose={() => !resolveMutation.isPending && setResolveTarget(null)} maxWidth='sm' fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Mark Flag as Solved</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {resolveTarget && (
            <>
              <Typography variant='body2' color='text.secondary'>
                User: <strong>{resolveTarget.user_email}</strong> · Akun: <code>{resolveTarget.account_name}</code>
                <br />
                Jenis: {REASON_LABELS[resolveTarget.reason]}
              </Typography>
              {resolveTarget.description && (
                <Alert severity='info' icon={false} sx={{ whiteSpace: 'pre-wrap' }}>
                  {resolveTarget.description}
                </Alert>
              )}
              <TextField
                label='Catatan resolusi (opsional)'
                value={resolutionNote}
                onChange={e => setResolutionNote(e.target.value)}
                multiline
                minRows={2}
                fullWidth
                placeholder='Misal: akun di-replace, password di-update, dll.'
                inputProps={{ maxLength: 500 }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setResolveTarget(null)} disabled={resolveMutation.isPending}>Batal</Button>
          <Button
            variant='contained'
            color='success'
            onClick={() => resolveTarget && resolveMutation.mutate({ id: resolveTarget.id, note: resolutionNote.trim() || undefined })}
            disabled={resolveMutation.isPending}
            startIcon={<i className={resolveMutation.isPending ? 'tabler-loader-2' : 'tabler-check'} />}
          >
            {resolveMutation.isPending ? 'Saving...' : 'Mark as Solved'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}

export default AdminAccountFlagsPage
