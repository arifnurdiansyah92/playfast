'use client'

import { useEffect, useState } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'

import { publicApi } from '@/lib/api'

const UnsubscribePage = ({ token }: { token: string }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Token unsubscribe tidak ditemukan.')

      return
    }
    publicApi
      .unsubscribe(token)
      .then(res => {
        setStatus('success')
        setMessage(res.message)
        setEmail(res.email)
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.message || 'Unsubscribe gagal.')
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
              <Typography color='text.secondary'>Memproses unsubscribe...</Typography>
            </>
          )}

          {status === 'success' && (
            <>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(76,175,80,0.08)' }}>
                <i className='tabler-circle-check' style={{ fontSize: 32, color: '#4caf50' }} />
              </Box>
              <Typography variant='h6' sx={{ fontWeight: 700, mb: 1 }}>Berhasil Unsubscribe</Typography>
              <Typography color='text.secondary' sx={{ mb: 1 }}>{message}</Typography>
              {email && (
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 4 }}>
                  Email: <strong>{email}</strong>
                </Typography>
              )}
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 4 }}>
                Kamu masih akan menerima email transaksional (verifikasi, reset password, konfirmasi pembayaran).
              </Typography>
              <Button component={Link} href='/' variant='contained' fullWidth>
                Kembali ke Playfast
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(244,67,54,0.08)' }}>
                <i className='tabler-alert-circle' style={{ fontSize: 32, color: '#f44336' }} />
              </Box>
              <Typography variant='h6' sx={{ fontWeight: 700, mb: 1 }}>Gagal Unsubscribe</Typography>
              <Typography color='text.secondary' sx={{ mb: 4 }}>{message}</Typography>
              <Button component={Link} href='/' variant='contained' fullWidth>
                Kembali
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default UnsubscribePage
