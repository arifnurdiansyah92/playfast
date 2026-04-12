'use client'

import { useState } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'

import CustomTextField from '@core/components/mui/TextField'
import { authApi } from '@/lib/api'

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) { setError('Email harus diisi'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Format email tidak valid'); return }

    setLoading(true)

    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan')
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
            <Typography variant='h4' sx={{ fontWeight: 700 }}>Playfast</Typography>
          </Box>

          {sent ? (
            <Box sx={{ textAlign: 'center' }}>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(201,168,76,0.08)' }}>
                <i className='tabler-mail-check' style={{ fontSize: 32, color: '#c9a84c' }} />
              </Box>
              <Typography variant='h5' sx={{ mb: 1.5, fontWeight: 600 }}>Cek Email Kamu</Typography>
              <Typography color='text.secondary' sx={{ mb: 2, lineHeight: 1.6 }}>
                Jika email <strong>{email}</strong> terdaftar, kamu akan menerima instruksi untuk reset password.
              </Typography>
              <Typography variant='body2' color='text.secondary' sx={{ mb: 4 }}>
                Belum menerima email? Hubungi admin via{' '}
                <a href='https://wa.me/6282240708329' target='_blank' rel='noopener noreferrer' style={{ color: '#c9a84c' }}>
                  WhatsApp
                </a>{' '}
                untuk bantuan.
              </Typography>
              <Button component={Link} href='/login' variant='contained' fullWidth>
                Kembali ke Login
              </Button>
            </Box>
          ) : (
            <>
              <Box sx={{ mb: 6 }}>
                <Typography variant='h5' sx={{ mb: 1.5 }}>Lupa Password?</Typography>
                <Typography color='text.secondary'>
                  Masukkan email yang terdaftar dan kami akan mengirimkan instruksi reset password.
                </Typography>
              </Box>

              {error && <Alert severity='error' sx={{ mb: 4 }}>{error}</Alert>}

              <form noValidate autoComplete='off' onSubmit={handleSubmit} className='flex flex-col gap-5'>
                <CustomTextField
                  autoFocus fullWidth label='Email' placeholder='your@email.com'
                  value={email} onChange={e => setEmail(e.target.value)}
                />
                <Button fullWidth variant='contained' type='submit' disabled={loading}>
                  {loading ? 'Mengirim...' : 'Kirim Instruksi Reset'}
                </Button>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Typography component={Link} href='/login' variant='body2' color='primary.main' sx={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <i className='tabler-arrow-left' style={{ fontSize: 16 }} />
                    Kembali ke Login
                  </Typography>
                </Box>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ForgotPasswordPage
