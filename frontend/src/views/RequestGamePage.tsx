'use client'

import { useState } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'

import type { GameRequest } from '@/lib/api'
import { gameRequestsApi, formatIDR, handleImageError, gameHeaderImage } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const STATUS_LABELS: Record<GameRequest['status'], string> = {
  pending: 'Menunggu',
  added: 'Sudah Ditambahkan',
  rejected: 'Ditolak',
}

const STATUS_COLORS: Record<GameRequest['status'], 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  added: 'success',
  rejected: 'error',
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

const RequestGamePage = () => {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [steamUrl, setSteamUrl] = useState('')
  const [snackMsg, setSnackMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const { data: myRequests = [], isLoading } = useQuery({
    queryKey: ['my-game-requests'],
    queryFn: () => gameRequestsApi.listMine(),
    enabled: !!user,
  })

  const submitMutation = useMutation({
    mutationFn: (url: string) => gameRequestsApi.submit(url),
    onSuccess: res => {
      queryClient.invalidateQueries({ queryKey: ['my-game-requests'] })
      setSnackMsg(res.message || 'Request berhasil dikirim')
      setSteamUrl('')
      setErrorMsg('')
    },
    onError: (err: any) => {
      setErrorMsg(err?.message || 'Gagal mengirim request')
    },
  })

  const removeVoteMutation = useMutation({
    mutationFn: (id: number) => gameRequestsApi.removeMyVote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-game-requests'] })
      setSnackMsg('Request dibatalkan')
    },
    onError: (err: any) => setSnackMsg(err?.message || 'Gagal membatalkan'),
  })

  if (authLoading) {
    return (
      <Card>
        <CardContent>
          <Skeleton height={48} />
          <Skeleton height={120} sx={{ mt: 2 }} />
        </CardContent>
      </Card>
    )
  }

  if (!user) {
    return (
      <Alert severity='warning'>
        Login dulu untuk request game.
      </Alert>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    const trimmed = steamUrl.trim()

    if (!trimmed) {
      setErrorMsg('Masukkan link Steam Store-nya dulu')

      return
    }
    submitMutation.mutate(trimmed)
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Request Game</Typography>
        <Typography color='text.secondary'>
          Mau game yang belum ada? Kirim link Steam Store-nya. Game yang paling banyak di-request bakal kita prioritaskan untuk ditambahkan.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Box component='form' onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label='Link Steam Store'
              placeholder='https://store.steampowered.com/app/1091500/Cyberpunk_2077/'
              value={steamUrl}
              onChange={e => setSteamUrl(e.target.value)}
              fullWidth
              autoComplete='off'
              disabled={submitMutation.isPending}
              helperText='Buka game yang kamu mau di Steam Store, copy URL-nya, lalu paste di sini.'
            />
            {errorMsg && <Alert severity='error' onClose={() => setErrorMsg('')}>{errorMsg}</Alert>}
            <Box>
              <Button
                type='submit'
                variant='contained'
                size='large'
                disabled={submitMutation.isPending || !steamUrl.trim()}
                startIcon={<i className={submitMutation.isPending ? 'tabler-loader-2' : 'tabler-send'} />}
              >
                {submitMutation.isPending ? 'Mengirim...' : 'Kirim Request'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Box>
        <Typography variant='h6' sx={{ fontWeight: 700, mb: 2 }}>
          Game yang sudah saya request
        </Typography>

        {isLoading ? (
          <Card><CardContent>{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} height={64} sx={{ mb: 1 }} />)}</CardContent></Card>
        ) : myRequests.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              <i className='tabler-bulb' style={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant='body1' sx={{ mt: 2 }} color='text.secondary'>
                Belum ada request. Kirim yang pertama!
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {myRequests.map(req => (
              <Card key={req.id} variant='outlined'>
                <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Box
                    component='img'
                    src={req.header_image || gameHeaderImage(req.appid)}
                    alt={req.name}
                    onError={handleImageError}
                    sx={{ width: 140, height: 'auto', borderRadius: 1, objectFit: 'cover', flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                      <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>{req.name}</Typography>
                      <Chip
                        size='small'
                        label={STATUS_LABELS[req.status]}
                        color={STATUS_COLORS[req.status]}
                        variant='tonal'
                      />
                      <Chip
                        size='small'
                        icon={<i className='tabler-users' style={{ fontSize: 14 }} />}
                        label={`${req.request_count} orang request`}
                        variant='outlined'
                      />
                    </Box>
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                      {req.original_price ? `Harga Steam: ${formatIDR(req.original_price)}` : 'Harga: —'}
                      {' · '}
                      Dikirim: {formatDate(req.created_at)}
                    </Typography>
                    {req.status === 'rejected' && req.admin_note && (
                      <Alert severity='error' icon={false} sx={{ mt: 1, py: 0.5 }}>
                        <Typography variant='caption'>Catatan admin: {req.admin_note}</Typography>
                      </Alert>
                    )}
                    {req.status === 'added' && (
                      <Alert severity='success' icon={false} sx={{ mt: 1, py: 0.5 }}>
                        <Typography variant='caption'>Game ini sudah ditambahkan ke katalog. Cek di halaman Toko!</Typography>
                      </Alert>
                    )}
                    <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button
                        size='small'
                        variant='text'
                        href={req.store_url}
                        target='_blank'
                        rel='noopener noreferrer'
                        startIcon={<i className='tabler-external-link' />}
                      >
                        Lihat di Steam
                      </Button>
                      {req.status === 'pending' && (
                        <Button
                          size='small'
                          variant='text'
                          color='error'
                          onClick={() => removeVoteMutation.mutate(req.id)}
                          disabled={removeVoteMutation.isPending}
                          startIcon={<i className='tabler-x' />}
                        >
                          Batalkan Request
                        </Button>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}

export default RequestGamePage
