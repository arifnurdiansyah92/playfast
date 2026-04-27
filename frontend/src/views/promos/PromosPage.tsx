'use client'

import { useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

import { storeApi, formatIDR } from '@/lib/api'
import type { MyPromo } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const formatDiscount = (p: MyPromo) =>
  p.discount_type === 'percentage' ? `${p.discount_value}% off` : `${formatIDR(p.discount_value)} off`

const formatScope = (s: string) => {
  if (s === 'all') return 'Semua item'
  if (s === 'games') return 'Game saja'
  if (s === 'subscriptions') return 'Subscription saja'
  if (s.startsWith('game:')) return 'Game tertentu'
  if (s.startsWith('sub:')) return `Plan ${s.split(':', 2)[1]}`

  return s
}

const PromosPage = () => {
  const { user } = useAuth()
  const [snack, setSnack] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['my-promos'],
    queryFn: () => storeApi.getMyPromos(),
    enabled: !!user,
  })

  if (!user) return <Alert severity='error'>Login dulu untuk lihat promo kamu.</Alert>

  const promos = data ?? []
  const usableCount = promos.filter(p => p.usable).length

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setSnack(`Kode ${code} disalin — paste di kolom promo saat checkout.`)
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>
          Promo Saya
        </Typography>
        <Typography color='text.secondary'>
          Kode promo eksklusif yang admin-assign khusus untuk akun kamu. Pakai saat checkout buat dapet potongan.
        </Typography>
      </Box>

      {isLoading ? (
        <Grid container spacing={2}>
          {[1, 2, 3].map(i => (
            <Grid size={{ xs: 12, sm: 6 }} key={i}>
              <Skeleton variant='rounded' height={140} />
            </Grid>
          ))}
        </Grid>
      ) : promos.length === 0 ? (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-discount' style={{ fontSize: 56, opacity: 0.3 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>Belum ada promo eksklusif</Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mt: 1, maxWidth: 420, mx: 'auto' }}>
              Promo yang muncul di sini hanya kode yang admin assign khusus ke akun kamu. Promo umum tetap bisa dipakai langsung di checkout — gak perlu di-list di sini.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <Typography variant='body2' color='text.secondary'>
            {usableCount} dari {promos.length} kode siap dipakai
          </Typography>
          <Grid container spacing={2}>
            {promos.map(p => {
              const expired = p.expired
              const used = p.used_count >= p.max_uses_per_user
              const inactive = !p.is_active

              return (
                <Grid size={{ xs: 12, sm: 6 }} key={p.id}>
                  <Card
                    sx={{
                      border: '1px solid',
                      borderColor: p.usable ? 'primary.main' : 'divider',
                      bgcolor: p.usable ? 'rgba(201,168,76,0.04)' : undefined,
                      opacity: p.usable ? 1 : 0.65,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1 }}>
                        <Chip
                          size='small'
                          color='primary'
                          variant='tonal'
                          icon={<i className='tabler-discount' style={{ fontSize: 14 }} />}
                          label={formatDiscount(p)}
                        />
                        {!p.usable && (
                          <Chip
                            size='small'
                            color='default'
                            variant='outlined'
                            label={inactive ? 'Tidak aktif' : expired ? 'Expired' : used ? 'Sudah dipakai' : 'Tidak bisa'}
                          />
                        )}
                      </Box>

                      <Typography
                        variant='h5'
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          color: p.usable ? 'primary.main' : 'text.secondary',
                          letterSpacing: 2,
                          mb: 1,
                          cursor: p.usable ? 'pointer' : 'default',
                          userSelect: 'all',
                        }}
                        onClick={() => p.usable && copyCode(p.code)}
                      >
                        {p.code}
                      </Typography>

                      {p.description && (
                        <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
                          {p.description}
                        </Typography>
                      )}

                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                        <Typography variant='caption' color='text.secondary'>
                          Berlaku untuk: <strong>{formatScope(p.scope)}</strong>
                        </Typography>
                      </Box>

                      {p.min_order_amount > 0 && (
                        <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                          Min pembelian: {formatIDR(p.min_order_amount)}
                        </Typography>
                      )}
                      {p.expires_at && (
                        <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                          Berakhir: {new Date(p.expires_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Typography>
                      )}

                      <Box sx={{ flexGrow: 1 }} />

                      <Button
                        variant='contained'
                        color='primary'
                        startIcon={<i className='tabler-copy' />}
                        onClick={() => copyCode(p.code)}
                        disabled={!p.usable}
                        sx={{ mt: 2, fontWeight: 600 }}
                        fullWidth
                      >
                        {p.usable ? 'Salin Kode' : 'Tidak tersedia'}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
        </>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={2500}
        onClose={() => setSnack('')}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}

export default PromosPage
