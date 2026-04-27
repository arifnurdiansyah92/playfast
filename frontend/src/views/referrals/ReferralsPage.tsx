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
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Snackbar from '@mui/material/Snackbar'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

import { storeApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

const ReferralsPage = () => {
  const { user } = useAuth()
  const [snack, setSnack] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['my-referral'],
    queryFn: () => storeApi.getMyReferral(),
    enabled: !!user,
  })

  if (!user) return <Alert severity='error'>Login dulu untuk lihat referral kamu.</Alert>

  const code = data?.code ?? ''
  const credit = data?.credit ?? 0
  const totalEarned = data?.total_earned ?? 0
  const referrals = data?.referrals ?? []
  const rewardedCount = referrals.filter(r => r.status === 'rewarded').length
  const pendingCount = referrals.filter(r => r.status === 'pending').length

  const shareUrl = code
    ? (typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${code}` : `https://playfast.id/register?ref=${code}`)
    : ''

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setSnack(`${label} disalin!`)
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>
          Referral Saya
        </Typography>
        <Typography color='text.secondary'>
          Bagikan kode referral kamu — setiap teman yang daftar dan transaksi pertama, kamu dapat credit yang bisa dipakai potongan order.
        </Typography>
      </Box>

      {isLoading ? (
        <Skeleton variant='rounded' height={140} />
      ) : (
        <>
          {/* Hero card with code + share link */}
          <Card sx={{ border: '1px solid', borderColor: 'primary.main', bgcolor: 'rgba(201,168,76,0.05)' }}>
            <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
              <Typography variant='caption' color='text.secondary' sx={{ letterSpacing: '0.15em', fontWeight: 600 }}>
                KODE REFERRAL KAMU
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, mb: 2, flexWrap: 'wrap' }}>
                <Typography
                  variant='h3'
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    color: 'primary.main',
                    letterSpacing: 4,
                    cursor: 'pointer',
                  }}
                  onClick={() => copyToClipboard(code, 'Kode')}
                >
                  {code || '—'}
                </Typography>
                <Tooltip title='Salin kode'>
                  <IconButton onClick={() => copyToClipboard(code, 'Kode')} color='primary' disabled={!code}>
                    <i className='tabler-copy' />
                  </IconButton>
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover', flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 220, overflow: 'hidden' }}>
                  <Typography variant='caption' color='text.secondary' sx={{ display: 'block', fontWeight: 600 }}>
                    Link Share
                  </Typography>
                  <Typography variant='body2' sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shareUrl || '—'}
                  </Typography>
                </Box>
                <Button
                  variant='contained'
                  size='small'
                  startIcon={<i className='tabler-link' />}
                  onClick={() => copyToClipboard(shareUrl, 'Link')}
                  disabled={!shareUrl}
                >
                  Salin Link
                </Button>
                {shareUrl && (
                  <Button
                    variant='outlined'
                    size='small'
                    startIcon={<i className='tabler-brand-whatsapp' />}
                    href={`https://wa.me/?text=${encodeURIComponent(`Coba Playfast — beli atau subscribe game Steam dengan harga lebih murah, pakai kode ${code} buat diskon: ${shareUrl}`)}`}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    Share via WA
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Stats */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h5' sx={{ fontWeight: 800, color: 'primary.main' }}>{referrals.length}</Typography>
                  <Typography variant='caption' color='text.secondary'>Total Daftar</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h5' sx={{ fontWeight: 800, color: 'success.main' }}>{rewardedCount}</Typography>
                  <Typography variant='caption' color='text.secondary'>Sudah Reward</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h5' sx={{ fontWeight: 800, color: 'warning.main' }}>{pendingCount}</Typography>
                  <Typography variant='caption' color='text.secondary'>Pending</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography variant='h6' sx={{ fontWeight: 800, color: 'primary.main' }}>{formatIDR(credit)}</Typography>
                  <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>Credit Aktif</Typography>
                  <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>(total earned: {formatIDR(totalEarned)})</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Referral list */}
          <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 0 }}>
              {referrals.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
                  <i className='tabler-share' style={{ fontSize: 48, opacity: 0.3 }} />
                  <Typography variant='h6' sx={{ mt: 2 }}>Belum ada yang daftar pakai kode kamu</Typography>
                  <Typography variant='body2' color='text.secondary' sx={{ mt: 1, maxWidth: 400, mx: 'auto' }}>
                    Share link di atas ke teman gamer kamu. Setiap mereka transaksi pertama (≥ Rp 50K), kamu otomatis dapat credit.
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>User</TableCell>
                        <TableCell>Daftar</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align='right'>Credit</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {referrals.map((r, i) => (
                        <TableRow key={i} hover>
                          <TableCell>
                            <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{r.email_masked}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant='caption' color='text.secondary'>{formatDate(r.joined_at)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size='small'
                              label={r.status === 'rewarded' ? 'Sudah Reward' : 'Belum Transaksi'}
                              color={r.status === 'rewarded' ? 'success' : 'warning'}
                              variant='tonal'
                            />
                          </TableCell>
                          <TableCell align='right'>
                            {r.status === 'rewarded'
                              ? <Typography variant='body2' sx={{ fontWeight: 600, color: 'success.main' }}>+{formatIDR(r.credit_awarded)}</Typography>
                              : <Typography variant='body2' color='text.disabled'>—</Typography>
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={2000}
        onClose={() => setSnack('')}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}

export default ReferralsPage
