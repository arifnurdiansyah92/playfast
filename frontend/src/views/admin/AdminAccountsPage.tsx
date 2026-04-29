'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
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
import Switch from '@mui/material/Switch'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Snackbar from '@mui/material/Snackbar'

import LinearProgress from '@mui/material/LinearProgress'

import CustomTextField from '@core/components/mui/TextField'

import { adminApi } from '@/lib/api'
import type { JobStatus } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminAccountsPage = () => {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [addOpen, setAddOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [addError, setAddError] = useState('')
  const [snackMsg, setSnackMsg] = useState('')
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [editPwId, setEditPwId] = useState<{ id: number; name: string } | null>(null)
  const [editPwValue, setEditPwValue] = useState('')
  const [logoutAllConfirmOpen, setLogoutAllConfirmOpen] = useState(false)

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => adminApi.getAccounts(),
    enabled: user?.role === 'admin'
  })

  const addMutation = useMutation({
    mutationFn: (formData: FormData) => adminApi.addAccount(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setAddOpen(false); setPassword(''); setFile(null); setAddError('')
      setSnackMsg('Account added successfully')
    },
    onError: (err: any) => setAddError(err.message || 'Failed to add account')
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      setDeleteConfirm(null)
      setSnackMsg('Account deleted')
    },
    onError: (err: any) => { setSnackMsg(`Delete failed: ${err.message}`); setDeleteConfirm(null) }
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => adminApi.updateAccount(id, { is_active }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      setSnackMsg(res?.message || 'Account updated')
    },
    onError: (err: any) => setSnackMsg(`Update failed: ${err.message}`)
  })

  const updatePwMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => adminApi.updateAccount(id, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      setEditPwId(null); setEditPwValue('')
      setSnackMsg('Password updated')
    },
    onError: (err: any) => setSnackMsg(`Update failed: ${err.message}`)
  })

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await adminApi.getJobStatus()

        if (res.job) {
          setActiveJob(res.job)

          if (res.job.status !== 'running') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
            queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
            queryClient.invalidateQueries({ queryKey: ['admin-games'] })
            setSnackMsg(res.job.message || `${res.job.job_type} ${res.job.status}`)
            setTimeout(() => setActiveJob(null), 5000)
          }
        } else {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
          setActiveJob(null)
        }
      } catch { /* ignore */ }
    }, 2000)
  }, [queryClient])

  // Check for active job on mount
  useEffect(() => {
    adminApi.getJobStatus().then(res => {
      if (res.job) {
        setActiveJob(res.job)
        if (res.job.status === 'running') startPolling()
      }
    }).catch(() => {})
    
return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [startPolling])

  const syncMutation = useMutation({
    mutationFn: () => adminApi.syncGames(),
    onSuccess: (res) => {
      if (res.job) { setActiveJob(res.job); startPolling() }
      setSnackMsg(res.message)
    },
    onError: (err: any) => setSnackMsg(`Sync failed: ${err.message}`)
  })

  const refreshMutation = useMutation({
    mutationFn: (scope: 'missing' | 'all' = 'missing') => adminApi.refreshGameMetadata(scope),
    onSuccess: (res) => {
      if (res.job) { setActiveJob(res.job); startPolling() }
      setSnackMsg(res.message)
    },
    onError: (err: any) => setSnackMsg(`Refresh failed: ${err.message}`)
  })

  const cancelJobMutation = useMutation({
    mutationFn: () => adminApi.cancelJob(),
    onSuccess: (res) => setSnackMsg(res.message),
    onError: (err: any) => setSnackMsg(err?.message || 'Cancel failed'),
  })

  const logoutAllBulkMutation = useMutation({
    mutationFn: () => adminApi.logoutAllBulk(),
    onSuccess: (res) => {
      setLogoutAllConfirmOpen(false)
      if (res.job) { setActiveJob(res.job); startPolling() }
      setSnackMsg(res.message)
    },
    onError: (err: any) => {
      setLogoutAllConfirmOpen(false)
      setSnackMsg(`Bulk logout failed: ${err.message}`)
    }
  })

  const syncOneMutation = useMutation({
    mutationFn: (id: number) => adminApi.syncAccount(id),
    onSuccess: (res) => {
      if (res.job) { setActiveJob(res.job); startPolling() }
      setSnackMsg(res.message)
    },
    onError: (err: any) => setSnackMsg(`Sync failed: ${err.message}`)
  })

  const handleAdd = () => {
    if (!file) { setAddError('Please select a maFile'); 

return }

    if (!password) { setAddError('Password is required'); 

return }

    const formData = new FormData()

    formData.append('mafile', file)
    formData.append('password', password)
    addMutation.mutate(formData)
  }

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ mb: 1 }}>Steam Accounts</Typography>
          <Typography color='text.secondary'>
            {accounts?.length ?? 0} accounts &middot; {accounts?.filter(a => a.is_active).length ?? 0} active
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant='outlined'
            color='error'
            startIcon={<i className='tabler-logout' />}
            onClick={() => setLogoutAllConfirmOpen(true)}
            disabled={!!activeJob?.status && activeJob.status === 'running'}
          >
            Logout All (All Accounts)
          </Button>
          <Button
            variant='outlined'
            startIcon={<i className='tabler-refresh' />}
            onClick={() => refreshMutation.mutate('missing')}
            disabled={!!activeJob?.status && activeJob.status === 'running'}
            title='Hanya re-fetch metadata untuk game yang masih kekurangan field'
          >
            Refresh Missing Metadata
          </Button>
          <Button
            variant='text'
            size='small'
            startIcon={<i className='tabler-refresh-dot' />}
            onClick={() => {
              if (window.confirm('Refresh metadata semua game? Bisa makan waktu lama (≈1.5s/game) dan re-fetch yang sudah lengkap pun. Pakai "Refresh Missing" untuk hasil lebih cepat.')) {
                refreshMutation.mutate('all')
              }
            }}
            disabled={!!activeJob?.status && activeJob.status === 'running'}
            title='Re-fetch metadata seluruh katalog (lambat)'
          >
            Refresh All
          </Button>
          <Button variant='outlined' startIcon={<i className='tabler-refresh' />} onClick={() => syncMutation.mutate()} disabled={!!activeJob?.status && activeJob.status === 'running'}>
            Sync All Games
          </Button>
          <Button variant='contained' startIcon={<i className='tabler-plus' />} onClick={() => setAddOpen(true)}>
            Add Account
          </Button>
        </Box>
      </Box>

      {/* Background job progress */}
      {activeJob && (() => {
        const jobLabel =
          activeJob.job_type === 'sync_games' ? 'Syncing All Games' :
          activeJob.job_type === 'sync_account' ? 'Syncing Account' :
          activeJob.job_type === 'logout_all_bulk' ? 'Logging Out All Devices' :
          activeJob.job_type === 'refresh_metadata' ? 'Refreshing Metadata' :
          activeJob.job_type

        const isRunning = activeJob.status === 'running'
        const cancelRequested = !!activeJob.cancel_requested

        // ETA based on processing pace so far
        let etaText: string | null = null

        if (isRunning && activeJob.total > 0 && activeJob.processed > 0) {
          const elapsedMs = Date.now() - new Date(activeJob.started_at).getTime()
          const perItem = elapsedMs / activeJob.processed
          const remainingMs = perItem * (activeJob.total - activeJob.processed)
          const mins = Math.floor(remainingMs / 60000)
          const secs = Math.floor((remainingMs % 60000) / 1000)

          etaText = mins > 0 ? `~${mins}m ${secs}s left` : `~${secs}s left`
        }

        return (
          <Card sx={{ border: '1px solid', borderColor: isRunning ? 'primary.main' : activeJob.status === 'completed' ? 'success.main' : 'warning.main' }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 2, flexWrap: 'wrap' }}>
                <Typography variant='body2' sx={{ fontWeight: 600 }}>
                  {jobLabel}
                  {isRunning && (cancelRequested ? ' (cancelling…)' : '…')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip
                    size='small'
                    label={isRunning ? `${activeJob.processed}/${activeJob.total}${etaText ? ` · ${etaText}` : ''}` : activeJob.status}
                    color={isRunning ? 'primary' : activeJob.status === 'completed' ? 'success' : activeJob.status === 'cancelled' ? 'warning' : 'warning'}
                    variant='tonal'
                  />
                  {isRunning && !cancelRequested && (
                    <Button
                      size='small'
                      color='warning'
                      variant='outlined'
                      startIcon={<i className='tabler-player-stop' />}
                      onClick={() => cancelJobMutation.mutate()}
                      disabled={cancelJobMutation.isPending}
                    >
                      Cancel
                    </Button>
                  )}
                  {!isRunning && (
                    <IconButton size='small' onClick={() => setActiveJob(null)}><i className='tabler-x' /></IconButton>
                  )}
                </Box>
              </Box>
              {isRunning && activeJob.total > 0 && (
                <LinearProgress variant='determinate' value={(activeJob.processed / activeJob.total) * 100} />
              )}
              {activeJob.message && (
                <Typography variant='caption' color='text.secondary' sx={{ mt: 0.5, display: 'block' }}>{activeJob.message}</Typography>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={60} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : !accounts || accounts.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-server' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>No accounts yet</Typography>
            <Typography color='text.secondary'>Add a Steam account to get started</Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>Username</TableCell>
                  <TableCell>Steam ID</TableCell>
                  <TableCell align='center'>Games</TableCell>
                  <TableCell align='center'>Active</TableCell>
                  <TableCell>Added</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.map(account => (
                  <TableRow key={account.id} hover sx={{ opacity: account.is_active ? 1 : 0.5 }}>
                    <TableCell>
                      <Typography
                        variant='subtitle2'
                        sx={{ fontWeight: 600, fontFamily: 'monospace', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                        onClick={() => router.push(`/admin/accounts/${account.id}`)}
                      >
                        {account.account_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{account.steam_id || '-'}</Typography>
                    </TableCell>
                    <TableCell align='center'>
                      <Chip size='small' label={account.game_count} variant='tonal' color='info' />
                    </TableCell>
                    <TableCell align='center'>
                      <Switch
                        checked={account.is_active}
                        onChange={() => toggleActiveMutation.mutate({ id: account.id, is_active: !account.is_active })}
                        size='small'
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(account.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell align='right'>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title='Sync games for this account'>
                          <IconButton size='small' onClick={() => syncOneMutation.mutate(account.id)} disabled={syncOneMutation.isPending}>
                            <i className='tabler-refresh' />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title='Change password'>
                          <IconButton size='small' onClick={() => { setEditPwId({ id: account.id, name: account.account_name }); setEditPwValue('') }}>
                            <i className='tabler-key' />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title='Delete account'>
                          <IconButton color='error' size='small' onClick={() => setDeleteConfirm(account.id)}>
                            <i className='tabler-trash' />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Add Account Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>Add Steam Account</DialogTitle>
        <DialogContent>
          {addError && <Alert severity='error' sx={{ mb: 3, mt: 1 }}>{addError}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <Box>
              <Typography variant='body2' sx={{ mb: 1 }}>Steam Guard maFile</Typography>
              <Button variant='outlined' component='label' startIcon={<i className='tabler-upload' />}>
                {file ? file.name : 'Choose maFile'}
                <input type='file' hidden accept='.mafile,.json' onChange={e => setFile(e.target.files?.[0] || null)} />
              </Button>
            </Box>
            <CustomTextField fullWidth label='Steam Password' type='password' value={password} onChange={e => setPassword(e.target.value)} placeholder='Enter the Steam account password' />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant='contained' onClick={handleAdd} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Adding...' : 'Add Account'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Password Dialog */}
      <Dialog open={!!editPwId} onClose={() => setEditPwId(null)} maxWidth='xs' fullWidth>
        <DialogTitle>Change Password — {editPwId?.name}</DialogTitle>
        <DialogContent>
          <CustomTextField fullWidth type='password' label='New Password' value={editPwValue} onChange={e => setEditPwValue(e.target.value)} placeholder='Enter new Steam password' sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditPwId(null)}>Cancel</Button>
          <Button variant='contained' onClick={() => editPwId && updatePwMutation.mutate({ id: editPwId.id, password: editPwValue })} disabled={!editPwValue || updatePwMutation.isPending}>
            {updatePwMutation.isPending ? 'Saving...' : 'Save Password'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Account?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently remove the Steam account and all associated data.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant='contained' color='error' onClick={() => deleteConfirm !== null && deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={logoutAllConfirmOpen} onClose={() => setLogoutAllConfirmOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Logout All Devices on All Accounts?</DialogTitle>
        <DialogContent>
          <Typography>
            Ini akan kick semua session di <strong>{accounts?.filter(a => a.is_active).length ?? 0} akun aktif</strong>.
            Proses berjalan di background. Pengguna Steam yang sedang main akan ke-logout.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setLogoutAllConfirmOpen(false)}>Cancel</Button>
          <Button
            variant='contained'
            color='error'
            onClick={() => logoutAllBulkMutation.mutate()}
            disabled={logoutAllBulkMutation.isPending}
          >
            {logoutAllBulkMutation.isPending ? 'Starting...' : 'Logout All'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminAccountsPage
