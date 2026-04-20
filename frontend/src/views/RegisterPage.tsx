'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'

import CustomTextField from '@core/components/mui/TextField'
import { useAuth } from '@/contexts/AuthContext'
import { storeApi } from '@/lib/api'

const RegisterPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [referralCode, setReferralCode] = useState('')
  const [referralValidation, setReferralValidation] = useState<{ valid: boolean; message: string } | null>(null)
  const { register } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')

  const handleReferralBlur = async () => {
    const code = referralCode.trim().toUpperCase()
    if (!code) { setReferralValidation(null); return }
    try {
      const res = await storeApi.validateReferralCode(code)
      if (res.valid) {
        setReferralValidation({ valid: true, message: `Kode valid — kamu akan di-refer oleh ${res.referrer_name}` })
      } else {
        setReferralValidation({ valid: false, message: res.error || 'Kode tidak ditemukan' })
      }
    } catch {
      setReferralValidation({ valid: false, message: 'Gagal validasi kode' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) { setError('Email harus diisi'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Format email tidak valid'); return }
    if (password.length < 6) { setError('Password minimal 6 karakter'); return }
    if (password !== confirmPassword) { setError('Password tidak cocok'); return }

    setLoading(true)

    try {
      await register(email, password, referralCode.trim().toUpperCase() || undefined)
      router.push(redirect || '/store')
    } catch (err: any) {
      setError(err.message || 'Gagal mendaftar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='flex bs-full justify-center items-center min-bs-[100dvh] p-6'>
      <Card sx={{ maxWidth: 440, width: '100%' }}>
        <CardContent sx={{ p: theme => `${theme.spacing(10, 9, 8)} !important` }}>
          <Box sx={{ mb: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box component='img' src='/images/brand/icon.png' alt='Playfast' sx={{ width: 44, height: 'auto', mr: 1.5 }} />
            <Typography variant='h4' sx={{ fontWeight: 700 }}>
              Playfast
            </Typography>
          </Box>
          <Box sx={{ mb: 6 }}>
            <Typography variant='h5' sx={{ mb: 1.5 }}>
              Buat Akun
            </Typography>
            <Typography color='text.secondary'>
              Bergabung di Playfast untuk mulai main game Steam
            </Typography>
          </Box>
          {error && (
            <Alert severity='error' sx={{ mb: 4 }}>
              {error}
            </Alert>
          )}
          <form noValidate autoComplete='off' onSubmit={handleSubmit} className='flex flex-col gap-5'>
            <CustomTextField
              autoFocus
              fullWidth
              label='Email'
              placeholder='your@email.com'
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <CustomTextField
              fullWidth
              label='Password'
              placeholder='Min. 6 karakter'
              type={isPasswordShown ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position='end'>
                      <IconButton edge='end' onClick={() => setIsPasswordShown(s => !s)} onMouseDown={e => e.preventDefault()}>
                        <i className={isPasswordShown ? 'tabler-eye-off' : 'tabler-eye'} />
                      </IconButton>
                    </InputAdornment>
                  )
                }
              }}
            />
            <CustomTextField
              fullWidth
              label='Konfirmasi Password'
              placeholder='Masukkan ulang password'
              type={isPasswordShown ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
            <CustomTextField
              label='Kode Referral (opsional)'
              value={referralCode}
              onChange={e => setReferralCode(e.target.value.toUpperCase())}
              onBlur={handleReferralBlur}
              fullWidth
              placeholder='e.g. ARIF2X4K'
              helperText={referralValidation?.message || 'Kalau kamu dapet kode dari temen, masukin di sini buat diskon first order'}
              error={referralValidation?.valid === false}
              FormHelperTextProps={{ sx: { color: referralValidation?.valid ? 'success.main' : undefined } }}
            />
            <Button fullWidth variant='contained' type='submit' disabled={loading}>
              {loading ? 'Membuat akun...' : 'Buat Akun'}
            </Button>
            <div className='flex justify-center items-center flex-wrap gap-2'>
              <Typography>Sudah punya akun?</Typography>
              <Typography component={Link} href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'} color='primary.main'>
                Masuk
              </Typography>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default RegisterPage
