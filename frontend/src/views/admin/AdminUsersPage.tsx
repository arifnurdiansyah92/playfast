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
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Snackbar from '@mui/material/Snackbar'

import Tooltip from '@mui/material/Tooltip'

import CustomTextField from '@core/components/mui/TextField'
import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminUsersPage = () => {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [snackMsg, setSnackMsg] = useState('')
  const [resetPwUser, setResetPwUser] = useState<{ id: number; email: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; email: string } | null>(null)
  const [lifetimeConfirm, setLifetimeConfirm] = useState<{ id: number; email: string } | null>(null)
  const [editReferralUser, setEditReferralUser] = useState<{ id: number; email: string; current_code: string } | null>(null)
  const [editReferralCode, setEditReferralCode] = useState('')
  const [editReferralError, setEditReferralError] = useState('')
  const [regenConfirm, setRegenConfirm] = useState<{ id: number; email: string } | null>(null)

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.getUsers(),
    enabled: currentUser?.role === 'admin'
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof adminApi.updateUser>[1] }) =>
      adminApi.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setSnackMsg('User updated')
    },
    onError: (err: any) => setSnackMsg(err.message || 'Failed')
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setDeleteConfirm(null)
      setSnackMsg('User deleted')
    },
    onError: (err: any) => setSnackMsg(err.message || 'Failed')
  })

  const lifetimeMutation = useMutation({
    mutationFn: (userId: number) => adminApi.grantLifetime(userId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      setLifetimeConfirm(null)
      setSnackMsg(res.message)
    },
    onError: (err: any) => { setSnackMsg(err.message || 'Failed'); setLifetimeConfirm(null) }
  })

  const editReferralMutation = useMutation({
    mutationFn: ({ id, code }: { id: number; code: string }) =>
      adminApi.updateUser(id, { referral_code: code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setEditReferralUser(null)
      setEditReferralCode('')
      setEditReferralError('')
      setSnackMsg('Referral code updated')
    },
    onError: (err: any) => setEditReferralError(err.message || 'Failed to update referral code')
  })

  const regenMutation = useMutation({
    mutationFn: (id: number) => adminApi.regenerateUserReferralCode(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setRegenConfirm(null)
      setSnackMsg(`New referral code: ${res.referral_code}`)
    },
    onError: (err: any) => { setSnackMsg(err.message || 'Failed'); setRegenConfirm(null) }
  })

  const handleEditReferralSubmit = () => {
    if (!editReferralUser) return
    const code = editReferralCode.trim().toUpperCase()
    if (!code) { setEditReferralError('Referral code cannot be empty'); return }
    if (code.length > 12) { setEditReferralError('Must be 12 characters or less'); return }
    if (!/^[A-Z0-9]+$/.test(code)) { setEditReferralError('Must be alphanumeric (letters and digits only)'); return }
    setEditReferralError('')
    editReferralMutation.mutate({ id: editReferralUser.id, code })
  }

  const handleResetPassword = () => {
    if (!resetPwUser || !newPassword) return
    updateMutation.mutate({ id: resetPwUser.id, data: { password: newPassword } })
    setResetPwUser(null)
    setNewPassword('')
  }

  if (currentUser?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>Users</Typography>
        <Typography color='text.secondary'>Manage platform users</Typography>
      </Box>

      {isLoading ? (
        <Card><CardContent>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={60} sx={{ mb: 1 }} />)}</CardContent></Card>
      ) : !users || users.length === 0 ? (
        <Card><CardContent sx={{ textAlign: 'center', py: 8 }}><Typography variant='h6'>No users</Typography></CardContent></Card>
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Orders</TableCell>
                  <TableCell>Referral Code</TableCell>
                  <TableCell>Joined</TableCell>
                  <TableCell align='right'>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map(u => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <TableRow key={u.id} hover>
                      <TableCell>#{u.id}</TableCell>
                      <TableCell>
                        <Typography variant='body2' sx={{ fontWeight: 600 }}>
                          {u.email}
                          {isSelf && <Chip label='You' size='small' sx={{ ml: 1 }} variant='tonal' color='info' />}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size='small'
                          label={u.is_admin ? 'Admin' : 'User'}
                          color={u.is_admin ? 'warning' : 'default'}
                          variant='tonal'
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size='small'
                          label={u.is_active ? 'Active' : 'Disabled'}
                          color={u.is_active ? 'success' : 'error'}
                          variant='tonal'
                        />
                      </TableCell>
                      <TableCell>{u.order_count}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant='body2' sx={{ fontFamily: 'monospace', letterSpacing: 1 }}>
                            {(u as any).referral_code ?? '—'}
                          </Typography>
                          {(u as any).referral_code && (
                            <>
                              <Tooltip title='Copy referral code'>
                                <IconButton
                                  size='small'
                                  onClick={() => {
                                    navigator.clipboard.writeText((u as any).referral_code)
                                    setSnackMsg('Referral code copied')
                                  }}
                                >
                                  <i className='tabler-copy' style={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title='Edit referral code'>
                                <IconButton
                                  size='small'
                                  onClick={() => {
                                    setEditReferralUser({ id: u.id, email: u.email, current_code: (u as any).referral_code })
                                    setEditReferralCode((u as any).referral_code)
                                    setEditReferralError('')
                                  }}
                                >
                                  <i className='tabler-pencil' style={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title='Regenerate referral code'>
                                <IconButton
                                  size='small'
                                  onClick={() => setRegenConfirm({ id: u.id, email: u.email })}
                                >
                                  <i className='tabler-refresh' style={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell align='right'>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          {!isSelf && (
                            <>
                              <Button
                                size='small'
                                variant='outlined'
                                color={u.is_active ? 'error' : 'success'}
                                onClick={() => updateMutation.mutate({ id: u.id, data: { is_active: !u.is_active } })}
                                disabled={updateMutation.isPending}
                              >
                                {u.is_active ? 'Disable' : 'Enable'}
                              </Button>
                              <Button
                                size='small'
                                variant='outlined'
                                color={u.is_admin ? 'inherit' : 'warning'}
                                onClick={() => updateMutation.mutate({ id: u.id, data: { is_admin: !u.is_admin } })}
                                disabled={updateMutation.isPending}
                              >
                                {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                              </Button>
                            </>
                          )}
                          <Tooltip title='Grant Lifetime Access'>
                            <IconButton size='small' color='warning' onClick={() => setLifetimeConfirm({ id: u.id, email: u.email })}>
                              <i className='tabler-crown' style={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <IconButton size='small' onClick={() => { setResetPwUser({ id: u.id, email: u.email }); setNewPassword('') }}>
                            <i className='tabler-key' style={{ fontSize: 18 }} />
                          </IconButton>
                          {!isSelf && (
                            <IconButton size='small' color='error' onClick={() => setDeleteConfirm({ id: u.id, email: u.email })}>
                              <i className='tabler-trash' style={{ fontSize: 18 }} />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPwUser} onClose={() => setResetPwUser(null)} maxWidth='xs' fullWidth>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <Typography color='text.secondary' sx={{ mb: 2 }}>
            Set a new password for <strong>{resetPwUser?.email}</strong>
          </Typography>
          <CustomTextField
            fullWidth
            type='password'
            label='New Password'
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder='Enter new password'
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetPwUser(null)}>Cancel</Button>
          <Button variant='contained' onClick={handleResetPassword} disabled={!newPassword || newPassword.length < 6}>
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth='xs' fullWidth>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Typography color='text.secondary'>
            Permanently delete <strong>{deleteConfirm?.email}</strong> and all their data?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            variant='contained'
            color='error'
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Grant Lifetime Dialog */}
      <Dialog open={!!lifetimeConfirm} onClose={() => setLifetimeConfirm(null)} maxWidth='xs' fullWidth>
        <DialogTitle>Grant Lifetime Access</DialogTitle>
        <DialogContent>
          <Typography color='text.secondary'>
            Grant lifetime Premium subscription to <strong>{lifetimeConfirm?.email}</strong>? This gives them unlimited access to all games forever.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLifetimeConfirm(null)}>Cancel</Button>
          <Button
            variant='contained'
            color='warning'
            onClick={() => lifetimeConfirm && lifetimeMutation.mutate(lifetimeConfirm.id)}
            disabled={lifetimeMutation.isPending}
          >
            {lifetimeMutation.isPending ? 'Granting...' : 'Grant Lifetime'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Referral Code Dialog */}
      <Dialog open={!!editReferralUser} onClose={() => { setEditReferralUser(null); setEditReferralError('') }} maxWidth='xs' fullWidth>
        <DialogTitle>Edit Referral Code</DialogTitle>
        <DialogContent>
          <Typography color='text.secondary' sx={{ mb: 2 }}>
            Set a custom referral code for <strong>{editReferralUser?.email}</strong>. Max 12 alphanumeric characters.
          </Typography>
          <CustomTextField
            fullWidth
            label='Referral Code'
            value={editReferralCode}
            onChange={e => {
              setEditReferralCode(e.target.value.toUpperCase())
              setEditReferralError('')
            }}
            inputProps={{ maxLength: 12 }}
            placeholder='E.g. MYCODE42'
            error={!!editReferralError}
            helperText={editReferralError || `Current: ${editReferralUser?.current_code}`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEditReferralUser(null); setEditReferralError('') }}>Cancel</Button>
          <Button
            variant='contained'
            onClick={handleEditReferralSubmit}
            disabled={editReferralMutation.isPending || !editReferralCode.trim()}
          >
            {editReferralMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Regenerate Referral Code Confirm Dialog */}
      <Dialog open={!!regenConfirm} onClose={() => setRegenConfirm(null)} maxWidth='xs' fullWidth>
        <DialogTitle>Regenerate Referral Code</DialogTitle>
        <DialogContent>
          <Typography color='text.secondary'>
            Generate a new random referral code for <strong>{regenConfirm?.email}</strong>? Their current code will be replaced.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenConfirm(null)}>Cancel</Button>
          <Button
            variant='contained'
            onClick={() => regenConfirm && regenMutation.mutate(regenConfirm.id)}
            disabled={regenMutation.isPending}
          >
            {regenMutation.isPending ? 'Regenerating...' : 'Regenerate'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} />
    </div>
  )
}

export default AdminUsersPage
