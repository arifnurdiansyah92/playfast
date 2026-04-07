'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'

import { useAuth } from '@/contexts/AuthContext'
import { authApi, storeApi, ApiError } from '@/lib/api'

const ProfilePage = () => {
  const router = useRouter()
  const { user, refreshUser } = useAuth()

  // Password change form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Snackbar state
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  })

  // Fetch orders for summary
  const { data: orders } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => storeApi.getOrders()
  })

  const totalOrders = orders?.length ?? 0
  const activeOrders = orders?.filter(o => !o.is_revoked).length ?? 0

  const handleChangePassword = async () => {
    if (!currentPassword) {
      setSnackbar({ open: true, message: 'Current password is required', severity: 'error' })
      return
    }

    if (!newPassword) {
      setSnackbar({ open: true, message: 'New password is required', severity: 'error' })
      return
    }

    if (newPassword.length < 6) {
      setSnackbar({ open: true, message: 'New password must be at least 6 characters', severity: 'error' })
      return
    }

    if (newPassword !== confirmPassword) {
      setSnackbar({ open: true, message: 'New passwords do not match', severity: 'error' })
      return
    }

    setLoading(true)

    try {
      await authApi.updateProfile({ current_password: currentPassword, password: newPassword })
      setSnackbar({ open: true, message: 'Password updated successfully', severity: 'success' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await refreshUser()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to update password'
      setSnackbar({ open: true, message, severity: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : ''

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>
          Profile
        </Typography>
        <Typography color='text.secondary'>Manage your account settings</Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Account Info */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardHeader
              title='Account Info'
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              avatar={<i className='tabler-user-circle' style={{ fontSize: 24 }} />}
            />
            <Divider />
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box>
                <Typography variant='caption' color='text.secondary' sx={{ mb: 0.5, display: 'block' }}>
                  Email
                </Typography>
                <Typography variant='body1' sx={{ fontWeight: 500 }}>
                  {user?.email}
                </Typography>
              </Box>
              <Box>
                <Typography variant='caption' color='text.secondary' sx={{ mb: 0.5, display: 'block' }}>
                  Role
                </Typography>
                <Chip
                  label={user?.role === 'admin' ? 'Admin' : 'User'}
                  color={user?.role === 'admin' ? 'primary' : 'default'}
                  size='small'
                  icon={<i className={user?.role === 'admin' ? 'tabler-shield-check' : 'tabler-user'} style={{ fontSize: 16 }} />}
                />
              </Box>
              <Box>
                <Typography variant='caption' color='text.secondary' sx={{ mb: 0.5, display: 'block' }}>
                  Member Since
                </Typography>
                <Typography variant='body1' sx={{ fontWeight: 500 }}>
                  {memberSince}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* My Orders Summary */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardHeader
              title='My Orders'
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              avatar={<i className='tabler-receipt' style={{ fontSize: 24 }} />}
            />
            <Divider />
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography color='text.secondary'>Total Orders</Typography>
                <Typography variant='h5' sx={{ fontWeight: 700 }}>
                  {totalOrders}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography color='text.secondary'>Active</Typography>
                <Chip label={activeOrders} color='success' size='small' sx={{ fontWeight: 600 }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography color='text.secondary'>Revoked</Typography>
                <Chip label={totalOrders - activeOrders} color={totalOrders - activeOrders > 0 ? 'error' : 'default'} size='small' sx={{ fontWeight: 600 }} />
              </Box>
              <Button
                variant='outlined'
                fullWidth
                startIcon={<i className='tabler-device-gamepad-2' />}
                onClick={() => router.push('/my-games')}
                sx={{ mt: 1, fontWeight: 600 }}
              >
                View My Games
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Change Password */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardHeader
              title='Change Password'
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              avatar={<i className='tabler-lock' style={{ fontSize: 24 }} />}
            />
            <Divider />
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label='Current Password'
                type={showCurrentPassword ? 'text' : 'password'}
                size='small'
                fullWidth
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position='end'>
                        <IconButton size='small' onClick={() => setShowCurrentPassword(p => !p)} edge='end'>
                          <i className={showCurrentPassword ? 'tabler-eye-off' : 'tabler-eye'} style={{ fontSize: 18 }} />
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
              />
              <TextField
                label='New Password'
                type={showNewPassword ? 'text' : 'password'}
                size='small'
                fullWidth
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                helperText='Minimum 6 characters'
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position='end'>
                        <IconButton size='small' onClick={() => setShowNewPassword(p => !p)} edge='end'>
                          <i className={showNewPassword ? 'tabler-eye-off' : 'tabler-eye'} style={{ fontSize: 18 }} />
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
              />
              <TextField
                label='Confirm New Password'
                type='password'
                size='small'
                fullWidth
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                error={confirmPassword.length > 0 && newPassword !== confirmPassword}
                helperText={confirmPassword.length > 0 && newPassword !== confirmPassword ? 'Passwords do not match' : ''}
              />
              <Button
                variant='contained'
                fullWidth
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                onClick={handleChangePassword}
                startIcon={<i className='tabler-check' />}
                sx={{ mt: 1, fontWeight: 600 }}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant='filled'
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  )
}

export default ProfilePage
