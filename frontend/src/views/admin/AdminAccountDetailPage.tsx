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

  const { data: accounts } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => adminApi.getAccounts(),
    enabled: user?.role === 'admin'
  })

  const account = accounts?.find(a => String(a.id) === accountId)

  const { data: confirmations, isLoading: confsLoading, refetch: refetchConfs } = useQuery({
    queryKey: ['confirmations', accountId],
    queryFn: () => adminApi.getConfirmations(Number(accountId)),
    enabled: user?.role === 'admin' && !!account,
    refetchInterval: 30000,
  })

  const loginMutation = useMutation({
    mutationFn: () => adminApi.loginAccount(Number(accountId)),
    onSuccess: (data) => {
      setSnackMsg(data.message)
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
    },
    onError: (err: any) => setSnackMsg(`Login failed: ${err.message}`)
  })

  const syncMutation = useMutation({
    mutationFn: () => adminApi.syncAccount(Number(accountId)),
    onSuccess: (data) => {
      setSnackMsg(data.success ? `Synced ${data.total_games} games` : `Sync failed: ${data.error}`)
      queryClient.invalidateQueries({ queryKey: ['admin-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-games'] })
    },
    onError: (err: any) => setSnackMsg(`Sync failed: ${err.message}`)
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

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminAccountDetailPage
