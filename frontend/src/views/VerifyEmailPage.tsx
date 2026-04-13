'use client'

import { useState, useEffect } from 'react'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'

import { authApi } from '@/lib/api'

const VerifyEmailPage = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Token verifikasi tidak ditemukan.')
      return
    }

    authApi.verifyEmail(token)
      .then(res => {
        setStatus('success')
        setMessage(res.message)
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.message || 'Verifikasi gagal.')
      })
  }, [token])

  return (
    <div className='flex bs-full justify-center items-center min-bs-[100dvh] p-6'>
      <Card sx={{ maxWidth: 440, width: '100%' }}>
        <CardContent sx={{ p: theme => `${theme.spacing(10, 9, 8)} !important`, textAlign: 'center' }}>
          <Box sx={{ mb: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box component='img' src='/images/brand/icon.png' alt='Playfast' sx={{ width: 44, height: 'auto', mr: 1.5 }} />
            <Typography variant='h4' sx={{ fontWeight: 700 }}>Playfast</Typography>
          </Box>

          {status === 'loading' && (
            <>
              <CircularProgress sx={{ mb: 3 }} />
              <Typography color='text.secondary'>Memverifikasi email...</Typography>
            </>
          )}

          {status === 'success' && (
            <>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(76,175,80,0.08)' }}>
                <i className='tabler-circle-check' style={{ fontSize: 32, color: '#4caf50' }} />
              </Box>
              <Typography variant='h5' sx={{ mb: 1.5, fontWeight: 600 }}>Email Terverifikasi!</Typography>
              <Typography color='text.secondary' sx={{ mb: 4 }}>{message}</Typography>
              <Button component={Link} href='/store' variant='contained' fullWidth>
                Jelajahi Game
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(244,67,54,0.08)' }}>
                <i className='tabler-circle-x' style={{ fontSize: 32, color: '#f44336' }} />
              </Box>
              <Typography variant='h5' sx={{ mb: 1.5, fontWeight: 600 }}>Verifikasi Gagal</Typography>
              <Typography color='text.secondary' sx={{ mb: 4 }}>{message}</Typography>
              <Button component={Link} href='/login' variant='contained' fullWidth>
                Kembali ke Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default VerifyEmailPage
