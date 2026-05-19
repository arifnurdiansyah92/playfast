'use client'

import { useEffect, useState } from 'react'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

import { useMutation } from '@tanstack/react-query'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'

import { redeemApi } from '@/lib/api'
import type { RedeemResponse } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const RedeemPage = () => {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [code, setCode] = useState('')
  const [success, setSuccess] = useState<RedeemResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Prefill from ?code= so shared links Just Work.
  useEffect(() => {
    const qc = searchParams.get('code')

    if (qc) setCode(qc.toUpperCase())
  }, [searchParams])

  const redeemMut = useMutation({
    mutationFn: (c: string) => redeemApi.redeem(c),
    onSuccess: (res) => {
      setSuccess(res)
      setError(null)
    },
    onError: (e: any) => {
      setError(e.message || 'Gagal redeem')
      setSuccess(null)
    },
  })

  // ── Not logged in: prompt login while preserving ?code= ──
  if (!loading && !user) {
    const next = `/redeem${code ? `?code=${encodeURIComponent(code)}` : ''}`

    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', mt: 8 }}>
        <Card>
          <CardContent>
            <Typography variant='h5' gutterBottom>Tukar Kode Redeem</Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
              Login dulu untuk menukar kode giveaway-mu.
            </Typography>
            <Stack direction='row' spacing={2}>
              <Button
                variant='contained'
                component={Link}
                href={`/login?next=${encodeURIComponent(next)}`}
                fullWidth
              >
                Login
              </Button>
              <Button
                variant='outlined'
                component={Link}
                href={`/register?next=${encodeURIComponent(next)}`}
                fullWidth
              >
                Daftar
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', mt: 6 }}>
      <Card>
        <CardContent>
          <Typography variant='h5' gutterBottom>Tukar Kode Redeem</Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
            Punya kode giveaway dari Playfast? Tukar di sini untuk langsung aktif.
          </Typography>

          {!success && (
            <Box
              component='form'
              onSubmit={(e) => {
                e.preventDefault()
                if (code.trim()) redeemMut.mutate(code.trim())
              }}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <TextField
                label='Kode'
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder='XXXX-XXXX-XXXX'
                fullWidth
                autoFocus
                inputProps={{ style: { fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' } }}
                error={!!error}
                helperText={error || 'Format: 3 grup x 4 karakter, dipisah strip'}
              />
              <Button
                type='submit'
                variant='contained'
                size='large'
                disabled={!code.trim() || redeemMut.isPending}
              >
                {redeemMut.isPending ? 'Memproses…' : 'Tukar'}
              </Button>
            </Box>
          )}

          {success && (
            <Box>
              <Alert severity='success' sx={{ mb: 2 }}>
                <Typography sx={{ fontWeight: 600 }}>{success.message}</Typography>
                <Typography variant='body2'>Reward: {success.reward_label}</Typography>
              </Alert>
              <Stack direction='row' spacing={2}>
                <Button
                  variant='contained'
                  fullWidth
                  onClick={() => router.push(success.redirect_to)}
                >
                  {success.reward_type === 'subscription' ? 'Lihat Subscription' : 'Lihat Game Saya'}
                </Button>
                <Button variant='outlined' fullWidth onClick={() => {
                  setSuccess(null)
                  setCode('')
                }}>
                  Tukar lagi
                </Button>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}

export default RedeemPage
