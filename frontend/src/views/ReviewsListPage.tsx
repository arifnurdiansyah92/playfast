'use client'

import { useEffect, useMemo, useState } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'

import { reviewsApi } from '@/lib/api'
import type { Review, ReviewListResponse, ReviewEligibility } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import ReviewSubmitDialog from '@/views/components/ReviewSubmitDialog'

const gold = '#c9a84c'
const goldLight = '#dfc06a'
const goldGlow = 'rgba(201,168,76,0.18)'
const dark = '#0c0e12'
const darkCard = 'rgba(22,25,32,0.7)'
const darkCardBorder = 'rgba(60,63,72,0.45)'
const textPrimary = '#e8eaed'
const textSecondary = '#9aa0a6'

const ratingFilters: { label: string; value: number | null }[] = [
  { label: 'Semua', value: null },
  { label: '5 bintang', value: 5 },
  { label: '4+ bintang', value: 4 },
  { label: '3+ bintang', value: 3 },
]

const ReviewsListPage = () => {
  const { user } = useAuth()

  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Review[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [ratingGte, setRatingGte] = useState<number | null>(null)
  const [hasPhoto, setHasPhoto] = useState(false)
  const [sort, setSort] = useState<'newest' | 'rating'>('newest')

  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [snack, setSnack] = useState<string | null>(null)

  const [lightbox, setLightbox] = useState<string | null>(null)

  const PER_PAGE = 12

  const fetchPage = async (p: number, append: boolean) => {
    if (p === 1) setLoading(true)
    else setLoadingMore(true)

    try {
      const res: ReviewListResponse = await reviewsApi.listPublic({
        page: p,
        per_page: PER_PAGE,
        rating_gte: ratingGte ?? undefined,
        has_photo: hasPhoto || undefined,
        sort,
      })

      setItems(append ? [...items, ...res.items] : res.items)
      setTotal(res.total)
      setPages(res.pages)
      setPage(p)
    } catch {
      setSnack('Gagal memuat review.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // Refetch on filter/sort change (back to page 1)
  useEffect(() => {
    fetchPage(1, false)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratingGte, hasPhoto, sort])

  // Eligibility (only for logged-in user)
  useEffect(() => {
    if (!user) {
      setEligibility(null)

      return
    }

    reviewsApi.eligibility().then(setEligibility).catch(() => setEligibility(null))
  }, [user])

  const composeLabel = useMemo(() => {
    if (!user) return 'Login untuk Tulis Review'
    if (!eligibility) return 'Tulis Review'
    if (!eligibility.eligible) return 'Hanya untuk Pelanggan'

    if (eligibility.has_review) {
      const status = eligibility.review?.status

      if (status === 'approved') return 'Lihat Review Saya'
      if (status === 'pending') return 'Edit Review (Pending)'
      if (status === 'rejected') return 'Edit & Kirim Ulang'
    }

    
return 'Tulis Review'
  }, [user, eligibility])

  const handleComposeClick = () => {
    if (!user) {
      window.location.href = '/login?next=/reviews'

      return
    }

    if (!eligibility) return

    if (!eligibility.eligible) {
      setSnack('Hanya pelanggan yang sudah pernah transaksi yang bisa menulis review.')

      return
    }

    if (eligibility.has_review && eligibility.review?.status === 'approved') {
      setSnack('Review kamu sudah disetujui. Hubungi admin untuk perubahan.')

      return
    }

    setComposeOpen(true)
  }

  const handleSaved = (saved: Review) => {
    setEligibility({ eligible: true, has_review: true, review: saved })
    setSnack(saved.status === 'pending' ? 'Review terkirim. Menunggu approval admin.' : 'Review diperbarui.')
    fetchPage(1, false)
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${dark} 0%, #111318 30%, #14161c 60%, ${dark} 100%)`,
        color: textPrimary,
      }}
    >
      <Box
        sx={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
          '&::before': {
            content: '""', position: 'absolute', top: '-25%', left: '50%',
            transform: 'translateX(-50%)', width: '120%', height: '50%', borderRadius: '50%',
            background: `radial-gradient(ellipse, ${goldGlow} 0%, transparent 70%)`,
          },
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {/* Top bar */}
        <Box
          sx={{
            py: 2, px: 3,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            maxWidth: 1200, mx: 'auto',
          }}
        >
          <Button
            component={Link}
            href='/'
            sx={{ color: textSecondary, p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent' } }}
            startIcon={<i className='tabler-arrow-left' />}
          >
            <Box component='img' src='/images/brand/wordmark.png' alt='Playfast' sx={{ height: { xs: 28, md: 34 }, ml: 1 }} />
          </Button>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {!user ? (
              <>
                <Button component={Link} href='/login' variant='text' sx={{ color: textSecondary, fontWeight: 600, '&:hover': { color: gold } }}>
                  Masuk
                </Button>
                <Button
                  component={Link} href='/register' variant='contained' size='small'
                  sx={{ bgcolor: gold, color: dark, fontWeight: 700, '&:hover': { bgcolor: goldLight } }}
                >
                  Daftar
                </Button>
              </>
            ) : (
              <Button component={Link} href='/store' variant='outlined' size='small' sx={{ borderColor: 'rgba(154,160,166,0.4)', color: textSecondary, '&:hover': { borderColor: gold, color: gold } }}>
                Ke Toko
              </Button>
            )}
          </Box>
        </Box>

        {/* Hero */}
        <Container maxWidth='lg' sx={{ pt: { xs: 4, md: 8 }, pb: 4, textAlign: 'center' }}>
          <Typography
            variant='h3'
            sx={{
              fontWeight: 800, mb: 1,
              fontSize: { xs: '1.8rem', sm: '2.4rem', md: '3rem' },
            }}
          >
            Review{' '}
            <Box
              component='span'
              sx={{
                background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Pelanggan
            </Box>
          </Typography>
          <Typography variant='body1' sx={{ color: textSecondary, mb: 4, maxWidth: 600, mx: 'auto' }}>
            Cerita langsung dari pengguna Playfast. Semua review berasal dari pelanggan yang sudah pernah transaksi.
          </Typography>

          <Button
            onClick={handleComposeClick}
            variant='contained'
            size='large'
            sx={{
              px: 4, py: 1.25, fontWeight: 700,
              bgcolor: gold, color: dark,
              '&:hover': { bgcolor: goldLight },
            }}
            startIcon={<i className='tabler-pencil-plus' />}
          >
            {composeLabel}
          </Button>
        </Container>

        {/* Filters */}
        <Container maxWidth='lg' sx={{ pb: 3 }}>
          <Box sx={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2,
            justifyContent: 'space-between',
          }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {ratingFilters.map(rf => (
                <Chip
                  key={rf.label}
                  label={rf.label}
                  variant={ratingGte === rf.value ? 'filled' : 'outlined'}
                  onClick={() => setRatingGte(rf.value)}
                  sx={{
                    fontWeight: 600,
                    bgcolor: ratingGte === rf.value ? gold : 'transparent',
                    color: ratingGte === rf.value ? dark : textSecondary,
                    borderColor: 'rgba(154,160,166,0.4)',
                    '&:hover': { bgcolor: ratingGte === rf.value ? goldLight : 'rgba(255,255,255,0.04)' },
                  }}
                />
              ))}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={hasPhoto}
                    onChange={e => setHasPhoto(e.target.checked)}
                    size='small'
                    sx={{ '& .MuiSwitch-thumb': { color: hasPhoto ? gold : undefined } }}
                  />
                }
                label='Hanya dgn foto'
                sx={{ color: textSecondary, mr: 0 }}
              />
              <Select
                size='small'
                value={sort}
                onChange={e => setSort(e.target.value as 'newest' | 'rating')}
                sx={{
                  minWidth: 160, color: textPrimary,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(154,160,166,0.3)' },
                }}
              >
                <MenuItem value='newest'>Terbaru</MenuItem>
                <MenuItem value='rating'>Rating tertinggi</MenuItem>
              </Select>
            </Box>
          </Box>

          <Typography variant='body2' sx={{ color: textSecondary, mt: 2 }}>
            {loading ? 'Memuat...' : `${total} review`}
          </Typography>
        </Container>

        {/* Grid */}
        <Container maxWidth='lg' sx={{ pb: 8 }}>
          {loading ? (
            <Grid container spacing={2}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
                  <Skeleton variant='rounded' height={240} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
                </Grid>
              ))}
            </Grid>
          ) : items.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <i className='tabler-message-off' style={{ fontSize: 48, opacity: 0.4 }} />
              <Typography sx={{ mt: 2, color: textSecondary }}>
                Belum ada review yang cocok dengan filter ini.
              </Typography>
            </Box>
          ) : (
            <>
              <Grid container spacing={2}>
                {items.map(r => (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={r.id}>
                    <Card sx={{
                      bgcolor: darkCard, border: `1px solid ${darkCardBorder}`,
                      height: '100%', display: 'flex', flexDirection: 'column',
                    }}>
                      <CardContent sx={{ p: 2.5, flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {[1, 2, 3, 4, 5].map(s => (
                              <i
                                key={s}
                                className={s <= r.rating ? 'tabler-star-filled' : 'tabler-star'}
                                style={{ fontSize: 16, color: s <= r.rating ? gold : 'rgba(154,160,166,0.3)' }}
                              />
                            ))}
                          </Box>
                          {r.is_featured && (
                            <Chip label='Featured' size='small' sx={{ height: 20, fontSize: '0.7rem', bgcolor: 'rgba(201,168,76,0.15)', color: gold, border: `1px solid rgba(201,168,76,0.3)` }} />
                          )}
                        </Box>

                        {r.headline && (
                          <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 1 }}>
                            {r.headline}
                          </Typography>
                        )}

                        <Typography
                          variant='body2'
                          sx={{ color: '#c7d5e0', lineHeight: 1.65, mb: r.images.length > 0 ? 1.5 : 2, fontStyle: 'italic', flex: 1 }}
                        >
                          &ldquo;{r.body}&rdquo;
                        </Typography>

                        {r.images.length > 0 && (
                          <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
                            {r.images.map(img => (
                              <Box
                                key={img.id}
                                component='img'
                                src={img.url}
                                alt=''
                                onClick={() => setLightbox(img.url)}
                                sx={{
                                  width: 64, height: 64, borderRadius: 1, objectFit: 'cover',
                                  border: '1px solid rgba(154,160,166,0.2)',
                                  cursor: 'pointer',
                                  transition: 'transform 0.15s ease',
                                  '&:hover': { transform: 'scale(1.05)' },
                                }}
                              />
                            ))}
                          </Box>
                        )}

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pt: 1, borderTop: `1px solid ${darkCardBorder}` }}>
                          <Box sx={{
                            width: 32, height: 32, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: `linear-gradient(135deg, rgba(201,168,76,0.2) 0%, rgba(201,168,76,0.05) 100%)`,
                            border: `1px solid rgba(201,168,76,0.25)`,
                            flexShrink: 0,
                          }}>
                            <i className='tabler-user' style={{ fontSize: 16, color: gold }} />
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant='caption' sx={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.display_email || 'Pelanggan'}
                            </Typography>
                            {r.plan_label && (
                              <Typography variant='caption' sx={{ color: gold, fontSize: '0.7rem', fontWeight: 600 }}>
                                {r.plan_label}
                              </Typography>
                            )}
                          </Box>
                          <Typography variant='caption' sx={{ color: textSecondary, fontSize: '0.7rem' }}>
                            {new Date(r.approved_at || r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {page < pages && (
                <Box sx={{ textAlign: 'center', mt: 4 }}>
                  <Button
                    onClick={() => fetchPage(page + 1, true)}
                    variant='outlined'
                    disabled={loadingMore}
                    sx={{ borderColor: 'rgba(154,160,166,0.4)', color: textSecondary, fontWeight: 600, '&:hover': { borderColor: gold, color: gold } }}
                  >
                    {loadingMore ? 'Memuat...' : 'Load More'}
                  </Button>
                </Box>
              )}
            </>
          )}
        </Container>
      </Box>

      {/* Lightbox */}
      {lightbox && (
        <Box
          onClick={() => setLightbox(null)}
          sx={{
            position: 'fixed', inset: 0, zIndex: 9999,
            bgcolor: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out', p: 4,
          }}
        >
          <Box component='img' src={lightbox} alt='' sx={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 2 }} />
        </Box>
      )}

      <ReviewSubmitDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        existing={eligibility?.review ?? null}
        onSaved={handleSaved}
      />

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </Box>
  )
}

export default ReviewsListPage
