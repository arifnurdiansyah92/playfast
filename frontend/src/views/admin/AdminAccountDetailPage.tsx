'use client'

import { useState, useCallback } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  accountId: string
}

const AdminAccountDetailPage = ({ accountId }: Props) => {
  const router = useRouter()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [snackMsg, setSnackMsg] = useState('')
  const [code, setCode] = useState('')
  const [codeRemaining, setCodeRemaining] = useState(0)
  const [codeLoading, setCodeLoading] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutResult, setLogoutResult] = useState<null | { devices: string[]; failed: number; relogin: boolean }>(null)

  // Single-account endpoint returns the Steam password too — the admin
  // detail page is where you actually need it (assisting customers,
  // pasting into Steam client, etc.). The list endpoint stays
  // password-less to avoid bulk leakage.
  const { data: account } = useQuery({
    queryKey: ['admin-account', accountId],
    queryFn: () => adminApi.getAccount(Number(accountId)),
    enabled: user?.role === 'admin' && Number.isFinite(Number(accountId)),
  })

  const [showPassword, setShowPassword] = useState(false)

  const { data: confirmations, isLoading: confsLoading, refetch: refetchConfs } = useQuery({
    queryKey: ['confirmations', accountId],
    queryFn: () => adminApi.getConfirmations(Number(accountId)),
    enabled: user?.role === 'admin' && !!account,
    refetchInterval: 30000,
  })

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['account-assignments', accountId],
    queryFn: () => adminApi.getAccountAssignments(Number(accountId)),
    enabled: user?.role === 'admin' && !!account,
  })

  const loginMutation = useMutation({
    mutationFn: () => adminApi.loginAccount(Number(accountId)),
    onSuccess: (data) => {
      setSnackMsg(data.message)
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-account', accountId] })
    },
    onError: (err: any) => setSnackMsg(err?.message || 'Login failed')
  })

  const syncMutation = useMutation({
    mutationFn: () => adminApi.syncAccount(Number(accountId)),
    onSuccess: (res) => {
      setSnackMsg(res.message)

      // Best-effort: refresh in 3s; full result lands when the bg job completes
      // and the user's next page visit re-fetches.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-account', accountId] })
        queryClient.invalidateQueries({ queryKey: ['admin-games'] })
      }, 3000)
    },
    onError: (err: any) => setSnackMsg(`Sync failed: ${err.message}`)
  })

  const logoutAllMutation = useMutation({
    mutationFn: () => adminApi.logoutAllDevices(Number(accountId)),
    onSuccess: (data) => {
      setLogoutConfirmOpen(false)
      setLogoutResult({ devices: data.devices, failed: data.failed_count, relogin: data.relogin_success })
      setSnackMsg(data.message)
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-account', accountId] })
    },
    onError: (err: any) => {
      setLogoutConfirmOpen(false)
      setSnackMsg(`Logout failed: ${err.message}`)
    }
  })

  const confirmMutation = useMutation({
    mutationFn: ({ confId, nonce, action }: { confId: string; nonce: string; action: 'allow' | 'cancel' }) =>
      adminApi.actOnConfirmation(Number(accountId), confId, nonce, action),
    onSuccess: (data) => {
      setSnackMsg(data.message)
      refetchConfs()
    },
    onError: (err: any) => setSnackMsg(`Action failed: ${err.message}`)
  })

  const handleGetCode = useCallback(async () => {
    setCodeLoading(true)

    try {
      const result = await adminApi.getAccountCode(Number(accountId))

      setCode(result.code)
      setCodeRemaining(result.remaining)
    } catch (err: any) {
      setSnackMsg(`Failed: ${err.message}`)
    } finally {
      setCodeLoading(false)
    }
  }, [accountId])

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  if (!account) {
    return (
      <div className='flex flex-col gap-4'>
        <Skeleton height={200} />
        <Skeleton height={300} />
      </div>
    )
  }

  const confs = confirmations?.confirmations ?? []

  return (
    <div className='flex flex-col gap-6'>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Button variant='text' startIcon={<i className='tabler-arrow-left' />} onClick={() => router.push('/admin/accounts')} sx={{ mb: 1 }}>
            Back to Accounts
          </Button>
          <Typography variant='h4' sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
            {account.account_name}
          </Typography>
          <Typography color='text.secondary'>
            Steam ID: {account.steam_id || 'N/A'} &middot; {account.game_count} games &middot;
            <Chip size='small' label={account.is_active ? 'Active' : 'Inactive'} color={account.is_active ? 'success' : 'error'} variant='tonal' sx={{ ml: 1 }} />
          </Typography>
        </Box>
      </Box>

      {/* Credentials — first thing visible. Admin role gate already passed
          at the route + endpoint level, so we surface the password directly.
          Both fields are click-to-copy; password masks/unmasks via the
          eye icon for screen-share situations. */}
      <Card sx={{ border: '2px solid', borderColor: 'primary.main' }}>
        <CardHeader
          title='Credentials'
          subheader='Login Steam langsung dengan info di bawah. Klik untuk salin.'
          avatar={<i className='tabler-key' style={{ fontSize: 24, color: '#c9a84c' }} />}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700, mb: 0.5 }}>
                Username
              </Typography>
              <Box
                onClick={() => { navigator.clipboard.writeText(account.account_name); setSnackMsg('Username disalin') }}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  p: 1.5, borderRadius: 1.5, cursor: 'pointer',
                  bgcolor: 'rgba(255,255,255,0.03)',
                  border: '1px solid', borderColor: 'divider',
                  transition: 'all 0.15s ease',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(201,168,76,0.04)' },
                }}
              >
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem' }}>
                  {account.account_name}
                </Typography>
                <Tooltip title='Salin'>
                  <IconButton size='small'><i className='tabler-copy' style={{ fontSize: 18 }} /></IconButton>
                </Tooltip>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700, mb: 0.5 }}>
                Password
              </Typography>
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  p: 1.5, borderRadius: 1.5,
                  bgcolor: 'rgba(255,255,255,0.03)',
                  border: '1px solid', borderColor: 'divider',
                  transition: 'all 0.15s ease',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(201,168,76,0.04)' },
                }}
              >
                <Typography
                  onClick={() => { if (account.password) { navigator.clipboard.writeText(account.password); setSnackMsg('Password disalin') } }}
                  sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem', cursor: 'pointer', flex: 1, userSelect: showPassword ? 'all' : 'none' }}
                >
                  {showPassword ? (account.password || '—') : '•'.repeat(12)}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  <Tooltip title={showPassword ? 'Sembunyikan' : 'Tampilkan'}>
                    <IconButton size='small' onClick={() => setShowPassword(s => !s)}>
                      <i className={showPassword ? 'tabler-eye-off' : 'tabler-eye'} style={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title='Salin'>
                    <IconButton size='small' onClick={() => { if (account.password) { navigator.clipboard.writeText(account.password); setSnackMsg('Password disalin') } }}>
                      <i className='tabler-copy' style={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Steam Guard Code */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title='Steam Guard Code'
              avatar={<i className='tabler-shield-lock' style={{ fontSize: 24 }} />}
            />
            <Divider />
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              {code ? (
                <>
                  <Typography
                    variant='h2'
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      letterSpacing: 8,
                      color: 'primary.main',
                      mb: 1,
                      cursor: 'pointer',
                    }}
                    onClick={() => { navigator.clipboard.writeText(code); setSnackMsg('Code copied!') }}
                  >
                    {code}
                  </Typography>
                  <Typography variant='body2' color='text.secondary'>
                    Expires in {codeRemaining}s — click to copy
                  </Typography>
                  <Button variant='outlined' size='small' onClick={handleGetCode} sx={{ mt: 2 }} disabled={codeLoading}>
                    Refresh
                  </Button>
                </>
              ) : (
                <Button
                  variant='contained'
                  size='large'
                  startIcon={<i className='tabler-shield-lock' />}
                  onClick={handleGetCode}
                  disabled={codeLoading}
                  sx={{ px: 4 }}
                >
                  {codeLoading ? 'Generating...' : 'Generate Code'}
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title='Account Actions'
              avatar={<i className='tabler-settings' style={{ fontSize: 24 }} />}
            />
            <Divider />
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant='outlined'
                fullWidth
                startIcon={<i className='tabler-login' />}
                onClick={() => loginMutation.mutate()}
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? 'Logging in...' : 'Force Login (Refresh Tokens)'}
              </Button>
              <Button
                variant='outlined'
                fullWidth
                startIcon={<i className='tabler-refresh' />}
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? 'Syncing...' : 'Sync Game Library'}
              </Button>
              <Button
                variant='outlined'
                fullWidth
                startIcon={<i className='tabler-reload' />}
                onClick={() => refetchConfs()}
              >
                Refresh Confirmations
              </Button>
              <Button
                variant='outlined'
                color='error'
                fullWidth
                startIcon={<i className='tabler-logout' />}
                onClick={() => setLogoutConfirmOpen(true)}
                disabled={logoutAllMutation.isPending}
              >
                {logoutAllMutation.isPending ? 'Logging out...' : 'Logout All Devices'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Confirmations */}
      <Card>
        <CardHeader
          title={`Trade Confirmations (${confs.length})`}
          avatar={<i className='tabler-checklist' style={{ fontSize: 24 }} />}
          action={
            confs.length > 0 ? (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size='small'
                  variant='contained'
                  color='success'
                  onClick={() => confs.forEach((c: any) => confirmMutation.mutate({ confId: String(c.id), nonce: String(c.nonce), action: 'allow' }))}
                  disabled={confirmMutation.isPending}
                >
                  Accept All
                </Button>
                <Button
                  size='small'
                  variant='outlined'
                  color='error'
                  onClick={() => confs.forEach((c: any) => confirmMutation.mutate({ confId: String(c.id), nonce: String(c.nonce), action: 'cancel' }))}
                  disabled={confirmMutation.isPending}
                >
                  Deny All
                </Button>
              </Box>
            ) : null
          }
        />
        <Divider />
        {confsLoading ? (
          <CardContent>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={50} sx={{ mb: 1 }} />)}</CardContent>
        ) : confs.length === 0 ? (
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <i className='tabler-checklist' style={{ fontSize: 40, opacity: 0.4 }} />
            <Typography variant='body1' color='text.secondary' sx={{ mt: 1 }}>
              No pending confirmations
            </Typography>
          </CardContent>
        ) : (
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Summary</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {confs.map((conf: any) => (
                  <TableRow key={conf.id} hover>
                    <TableCell>{conf.id}</TableCell>
                    <TableCell>
                      <Chip size='small' label={conf.type_name || conf.type || 'Unknown'} variant='tonal' />
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{conf.headline || 'N/A'}</Typography>
                      {conf.summary?.map((line: string, i: number) => (
                        <Typography key={i} variant='caption' color='text.secondary' display='block'>{line}</Typography>
                      ))}
                    </TableCell>
                    <TableCell align='right'>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title='Accept'>
                          <IconButton
                            size='small'
                            color='success'
                            onClick={() => confirmMutation.mutate({ confId: String(conf.id), nonce: String(conf.nonce), action: 'allow' })}
                            disabled={confirmMutation.isPending}
                          >
                            <i className='tabler-check' />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title='Deny'>
                          <IconButton
                            size='small'
                            color='error'
                            onClick={() => confirmMutation.mutate({ confId: String(conf.id), nonce: String(conf.nonce), action: 'cancel' })}
                            disabled={confirmMutation.isPending}
                          >
                            <i className='tabler-x' />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Assigned Users */}
      <Card>
        <CardHeader
          title={`Assigned Users (${assignments?.length ?? 0})`}
          avatar={<i className='tabler-users' style={{ fontSize: 24 }} />}
        />
        <Divider />
        {assignmentsLoading ? (
          <CardContent>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={50} sx={{ mb: 1 }} />)}</CardContent>
        ) : !assignments || assignments.length === 0 ? (
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <i className='tabler-users' style={{ fontSize: 40, opacity: 0.4 }} />
            <Typography variant='body1' color='text.secondary' sx={{ mt: 1 }}>
              No users assigned to this account
            </Typography>
          </CardContent>
        ) : (
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>User Email</TableCell>
                  <TableCell>Game</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Assigned Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map(a => (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.user_email}</TableCell>
                    <TableCell>{a.game_name}</TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={a.is_revoked ? 'Revoked' : 'Active'}
                        color={a.is_revoked ? 'error' : 'success'}
                        variant='tonal'
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(a.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Dialog open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Logout All Devices?</DialogTitle>
        <DialogContent>
          <Typography>
            Ini akan kick semua device yang saat ini login ke <strong>{account.account_name}</strong>.
            Pengguna Steam yang sedang main akan ke-logout pada request berikutnya.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setLogoutConfirmOpen(false)}>Cancel</Button>
          <Button
            variant='contained'
            color='error'
            onClick={() => logoutAllMutation.mutate()}
            disabled={logoutAllMutation.isPending}
          >
            {logoutAllMutation.isPending ? 'Logging out...' : 'Logout All'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!logoutResult} onClose={() => setLogoutResult(null)} maxWidth='sm' fullWidth>
        <DialogTitle>Logout Complete</DialogTitle>
        <DialogContent>
          {!logoutResult?.relogin && (
            <Alert severity='warning' sx={{ mb: 2 }}>
              Re-login otomatis gagal. Klik &quot;Force Login&quot; di atas untuk recovery manual.
            </Alert>
          )}
          <Typography variant='body2' sx={{ mb: 1 }}>
            Kicked {logoutResult?.devices.length ?? 0} device(s):
          </Typography>
          <Box component='ul' sx={{ pl: 3, m: 0 }}>
            {logoutResult?.devices.map((d, i) => (
              <li key={`${d}-${i}`}><Typography variant='body2'>{d}</Typography></li>
            ))}
          </Box>
          {(logoutResult?.failed ?? 0) > 0 && (
            <Typography variant='body2' color='warning.main' sx={{ mt: 2 }}>
              {logoutResult?.failed} device(s) gagal di-revoke dan mungkin masih punya session aktif.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setLogoutResult(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminAccountDetailPage
