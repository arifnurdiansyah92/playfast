'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'

import CustomTextField from '@core/components/mui/TextField'
import { authApi } from '@/lib/api'

const ResetPasswordPage = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token) { setError('Token reset tidak valid. Gunakan link yang diberikan admin.'); return }
    if (password.length < 6) { setError('Password minimal 6 karakter'); return }
    if (password !== confirmPassword) { setError('Password tidak cocok'); return }

    setLoading(true)

    try {
      await authApi.resetPassword(token, password)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Gagal mereset password')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className='flex bs-full justify-center items-center min-bs-[100dvh] p-6'>
        <Card sx={{ maxWidth: 440, width: '100%' }}>
          <CardContent sx={{ p: theme => `${theme.spacing(10, 9, 8)} !important`, textAlign: 'center' }}>
            <Box sx={{ width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,76,81,0.08)' }}>
              <i className='tabler-link-off' style={{ fontSize: 32, color: '#FF4C51' }} />
            </Box>
            <Typography variant='h5' sx={{ mb: 1.5, fontWeight: 600 }}>Link Tidak Valid</Typography>
            <Typography color='text.secondary' sx={{ mb: 4 }}>
              Link reset password tidak valid atau sudah kedaluwarsa. Silakan minta link baru.
            </Typography>
            <Button component={Link} href='/forgot-password' variant='contained' fullWidth>
              Minta Link Baru
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='flex bs-full justify-center items-center min-bs-[100dvh] p-6'>
      <Card sx={{ maxWidth: 440, width: '100%' }}>
        <CardContent sx={{ p: theme => `${theme.spacing(10, 9, 8)} !important` }}>
          <Box sx={{ mb: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box component='img' src='/images/brand/icon.png' alt='Playfast' sx={{ width: 44, height: 'auto', mr: 1.5 }} />
            <Typography variant='h4' sx={{ fontWeight: 700 }}>Playfast</Typography>
          </Box>

          {success ? (
            <Box sx={{ textAlign: 'center' }}>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(40,199,111,0.08)' }}>
                <i className='tabler-check' style={{ fontSize: 32, color: '#28C76F' }} />
              </Box>
              <Typography variant='h5' sx={{ mb: 1.5, fontWeight: 600 }}>Password Berhasil Direset</Typography>
              <Typography color='text.secondary' sx={{ mb: 4 }}>
                Password kamu sudah diganti. Silakan login dengan password baru.
              </Typography>
              <Button component={Link} href='/login' variant='contained' fullWidth>
                Masuk Sekarang
              </Button>
            </Box>
          ) : (
            <>
              <Box sx={{ mb: 6 }}>
                <Typography variant='h5' sx={{ mb: 1.5 }}>Reset Password</Typography>
                <Typography color='text.secondary'>Masukkan password baru untuk akun kamu.</Typography>
              </Box>

              {error && <Alert severity='error' sx={{ mb: 4 }}>{error}</Alert>}

              <form noValidate autoComplete='off' onSubmit={handleSubmit} className='flex flex-col gap-5'>
                <CustomTextField
                  fullWidth label='Password Baru' placeholder='Min. 6 karakter'
                  type={showPassword ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position='end'>
                          <IconButton edge='end' onClick={() => setShowPassword(!showPassword)}>
                            <i className={showPassword ? 'tabler-eye-off' : 'tabler-eye'} />
                          </IconButton>
                        </InputAdornment>
                      )
                    }
                  }}
                />
                <CustomTextField
                  fullWidth label='Konfirmasi Password' placeholder='Ulangi password baru'
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                />
                <Button fullWidth variant='contained' type='submit' disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ResetPasswordPage
