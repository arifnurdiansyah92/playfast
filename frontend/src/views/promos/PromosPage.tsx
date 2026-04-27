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
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Collapse from '@mui/material/Collapse'

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

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const buildShareLink = (code: string, scope: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://playfast.id'
  const encoded = encodeURIComponent(code)

  if (scope === 'subscriptions') return `${origin}/subscribe?code=${encoded}`
  if (scope.startsWith('sub:')) {
    const plan = scope.split(':', 2)[1]

    return `${origin}/subscribe?code=${encoded}&plan=${encodeURIComponent(plan)}`
  }

  return `${origin}/store?code=${encoded}`
}

const PromosPage = () => {
  const { user } = useAuth()
  const [snack, setSnack] = useState('')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['my-promos'],
    queryFn: () => storeApi.getMyPromos(),
    enabled: !!user,
  })

  if (!user) return <Alert severity='error'>Login dulu untuk lihat promo tracker kamu.</Alert>

  const promos = data ?? []
  const totalUses = promos.reduce((sum, p) => sum + p.total_uses, 0)
  const totalPaid = promos.reduce((sum, p) => sum + p.paid_redemptions, 0)
  const totalDiscount = promos.reduce((sum, p) => sum + p.total_discount_given, 0)
  const totalRevenue = promos.reduce((sum, p) => sum + p.total_revenue_contributed, 0)
  const activeCount = promos.filter(p => p.is_active && !p.expired).length

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setSnack(`${label} disalin`)
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>
          Promo Tracker
        </Typography>
        <Typography color='text.secondary'>
          Kode promo yang admin assign ke akun kamu untuk tracking. Kodenya tetap public — siapapun bisa pakai. Halaman ini buat lihat siapa aja yang sudah redeem & berapa kontribusinya.
        </Typography>
      </Box>

      {isLoading ? (
        <Grid container spacing={2}>
          {[1, 2, 3].map(i => (
            <Grid size={{ xs: 12 }} key={i}>
              <Skeleton variant='rounded' height={180} />
            </Grid>
          ))}
        </Grid>
      ) : promos.length === 0 ? (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-discount' style={{ fontSize: 56, opacity: 0.3 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>Belum ada kode yang di-assign</Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mt: 1, maxWidth: 460, mx: 'auto' }}>
              Halaman ini muncul kalau admin sudah assign kode promo ke akun kamu untuk tracking. Hubungi admin kalau kamu marketer/affiliate yang butuh kode tracking sendiri.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Aggregate stats across all owned codes */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h5' sx={{ fontWeight: 800, color: 'primary.main' }}>{promos.length}</Typography>
                  <Typography variant='caption' color='text.secondary'>Total Kode</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h5' sx={{ fontWeight: 800, color: 'success.main' }}>{activeCount}</Typography>
                  <Typography variant='caption' color='text.secondary'>Aktif</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h5' sx={{ fontWeight: 800, color: 'primary.main' }}>
                    {totalPaid}
                    <Typography component='span' variant='body2' color='text.secondary' sx={{ ml: 0.5 }}>/ {totalUses}</Typography>
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>Redeem (paid / total)</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h6' sx={{ fontWeight: 800, color: 'warning.main' }}>{formatIDR(totalDiscount)}</Typography>
                  <Typography variant='caption' color='text.secondary'>Total Diskon</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 8, md: 2.4 }}>
              <Card sx={{ border: '1px solid', borderColor: 'success.main', bgcolor: 'rgba(76,175,80,0.05)', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h6' sx={{ fontWeight: 800, color: 'success.main' }}>{formatIDR(totalRevenue)}</Typography>
                  <Typography variant='caption' color='text.secondary'>Revenue Kontribusi</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Per-code cards with activity feed */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {promos.map(p => {
              const inactive = !p.is_active || p.expired
              const shareLink = buildShareLink(p.code, p.scope)
              const isExpanded = !!expanded[p.id]

              return (
                <Card
                  key={p.id}
                  sx={{
                    border: '1px solid',
                    borderColor: inactive ? 'divider' : 'primary.main',
                    bgcolor: inactive ? undefined : 'rgba(201,168,76,0.03)',
                    opacity: inactive ? 0.7 : 1,
                  }}
                >
                  <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                    {/* Header: code + status + discount */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
                      <Typography
                        variant='h5'
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          color: inactive ? 'text.secondary' : 'primary.main',
                          letterSpacing: 2,
                          cursor: 'pointer',
                          userSelect: 'all',
                        }}
                        onClick={() => copy(p.code, 'Kode')}
                      >
                        {p.code}
                      </Typography>
                      <Chip
                        size='small'
                        color={inactive ? 'default' : 'primary'}
                        variant='tonal'
                        icon={<i className='tabler-discount' style={{ fontSize: 14 }} />}
                        label={formatDiscount(p)}
                      />
                      <Chip
                        size='small'
                        color={p.is_active && !p.expired ? 'success' : 'default'}
                        variant='outlined'
                        label={p.expired ? 'Expired' : p.is_active ? 'Aktif' : 'Tidak aktif'}
                      />
                      <Box sx={{ flex: 1 }} />
                      <Tooltip title='Salin kode'>
                        <IconButton size='small' onClick={() => copy(p.code, 'Kode')}>
                          <i className='tabler-copy' />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title='Salin link share'>
                        <IconButton size='small' onClick={() => copy(shareLink, 'Link')}>
                          <i className='tabler-link' />
                        </IconButton>
                      </Tooltip>
                      {shareLink && (
                        <Tooltip title='Share via WhatsApp'>
                          <IconButton
                            size='small'
                            component='a'
                            href={`https://wa.me/?text=${encodeURIComponent(`Pakai kode ${p.code} buat dapet diskon di Playfast: ${shareLink}`)}`}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <i className='tabler-brand-whatsapp' />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>

                    {p.description && (
                      <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
                        {p.description}
                      </Typography>
                    )}

                    {/* Scope/limits */}
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                      <Typography variant='caption' color='text.secondary'>
                        Berlaku: <strong>{formatScope(p.scope)}</strong>
                      </Typography>
                      {p.min_order_amount > 0 && (
                        <Typography variant='caption' color='text.secondary'>
                          Min order: <strong>{formatIDR(p.min_order_amount)}</strong>
                        </Typography>
                      )}
                      {p.expires_at && (
                        <Typography variant='caption' color='text.secondary'>
                          Berakhir: <strong>{new Date(p.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                        </Typography>
                      )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Per-code stats */}
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 6, sm: 3 }}>
                        <Typography variant='caption' color='text.secondary'>Redeem (paid/total)</Typography>
                        <Typography variant='h6' sx={{ fontWeight: 700, color: 'primary.main' }}>
                          {p.paid_redemptions}
                          <Typography component='span' variant='body2' color='text.secondary' sx={{ ml: 0.5 }}>
                            / {p.total_uses}
                            {p.max_uses_total != null && ` (cap ${p.max_uses_total})`}
                          </Typography>
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 6, sm: 3 }}>
                        <Typography variant='caption' color='text.secondary'>Total Diskon</Typography>
                        <Typography variant='h6' sx={{ fontWeight: 700, color: 'warning.main' }}>
                          {formatIDR(p.total_discount_given)}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 3 }}>
                        <Typography variant='caption' color='text.secondary'>Revenue Kontribusi</Typography>
                        <Typography variant='h6' sx={{ fontWeight: 700, color: 'success.main' }}>
                          {formatIDR(p.total_revenue_contributed)}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 3 }} sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                        {p.recent_uses.length > 0 && (
                          <Button
                            size='small'
                            variant='text'
                            endIcon={<i className={isExpanded ? 'tabler-chevron-up' : 'tabler-chevron-down'} />}
                            onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                          >
                            {isExpanded ? 'Tutup' : `Lihat ${p.recent_uses.length} terakhir`}
                          </Button>
                        )}
                      </Grid>
                    </Grid>

                    {/* Activity feed */}
                    <Collapse in={isExpanded}>
                      <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
                        {p.recent_uses.length === 0 ? (
                          <Typography variant='body2' color='text.secondary'>Belum ada yang redeem</Typography>
                        ) : (
                          p.recent_uses.map((u, idx) => (
                            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: idx < p.recent_uses.length - 1 ? '1px solid' : undefined, borderColor: 'divider', gap: 2, flexWrap: 'wrap' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 200, flexWrap: 'wrap' }}>
                                <i className='tabler-user' style={{ fontSize: 14, color: '#9aa0a6' }} />
                                <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{u.email_masked}</Typography>
                                <Typography variant='caption' color='text.secondary'>· {formatDateTime(u.used_at)}</Typography>
                                {u.subscription_id != null && <Chip size='small' label='Sub' variant='outlined' />}
                                {u.order_id != null && <Chip size='small' label='Game' variant='outlined' />}
                                {!u.paid && <Chip size='small' label='pending' color='warning' variant='outlined' />}
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Box sx={{ textAlign: 'right' }}>
                                  <Typography variant='caption' color='text.secondary' sx={{ display: 'block', lineHeight: 1 }}>diskon</Typography>
                                  <Typography variant='body2' sx={{ fontWeight: 600, color: 'warning.main' }}>
                                    −{formatIDR(u.discount_amount)}
                                  </Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right', minWidth: 90 }}>
                                  <Typography variant='caption' color='text.secondary' sx={{ display: 'block', lineHeight: 1 }}>revenue</Typography>
                                  <Typography variant='body2' sx={{ fontWeight: 600, color: u.paid ? 'success.main' : 'text.disabled' }}>
                                    {u.paid ? formatIDR(u.revenue_amount) : '—'}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>
                          ))
                        )}
                      </Box>
                    </Collapse>
                  </CardContent>
                </Card>
              )
            })}
          </Box>
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
