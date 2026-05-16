'use client'

import { useRef, useState } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'

import { creatorApi, formatIDR } from '@/lib/api'
import type { CreatorPlatform, CreatorFollowerBucket } from '@/lib/api'

/* ── Brand palette (matched to existing /landing aesthetic) ─────────────── */
const gold = '#c9a84c'
const goldLight = '#dfc06a'
const goldGlow = 'rgba(201,168,76,0.18)'
const dark = '#0c0e12'
const darkCard = 'rgba(22,25,32,0.7)'
const darkCardBorder = 'rgba(60,63,72,0.45)'
const textPrimary = '#e8eaed'
const textSecondary = '#9aa0a6'

const platforms: { value: CreatorPlatform; label: string }[] = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'x', label: 'X / Twitter' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'other', label: 'Lainnya' },
]

const followerBuckets: CreatorFollowerBucket[] = ['<1K', '1-10K', '10-50K', '50-100K', '100K+']

interface FormState {
  name: string
  email: string
  whatsapp: string
  platform: CreatorPlatform | ''
  handle: string
  follower_bucket: CreatorFollowerBucket | ''
  link1: string
  link2: string
  niche: string
  pitch: string
}

const initialForm: FormState = {
  name: '', email: '', whatsapp: '', platform: '',
  handle: '', follower_bucket: '', link1: '', link2: '',
  niche: '', pitch: '',
}

const SectionEyebrow = ({ children }: { children: React.ReactNode }) => (
  <Typography
    variant='overline'
    sx={{
      color: gold,
      fontWeight: 800,
      letterSpacing: '0.18em',
      fontSize: '0.72rem',
      display: 'block',
      mb: 1.5,
    }}
  >
    {children}
  </Typography>
)

const StatBlock = ({ value, label, sx }: { value: string; label: string; sx?: any }) => (
  <Box sx={sx}>
    <Typography
      sx={{
        fontSize: { xs: '2rem', md: '2.6rem' },
        fontWeight: 900,
        lineHeight: 1.1,
        letterSpacing: '-0.02em',
        background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 100%)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}
    >
      {value}
    </Typography>
    <Typography variant='caption' sx={{ color: textSecondary, mt: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem', fontWeight: 600 }}>
      {label}
    </Typography>
  </Box>
)

const StepRow = ({ num, title, desc, color = gold }: { num: string; title: string; desc: string; color?: string }) => (
  <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
    <Box
      sx={{
        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
        background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: dark, fontWeight: 900, fontSize: '1.1rem',
        boxShadow: `0 4px 16px ${color}44`,
      }}
    >
      {num}
    </Box>
    <Box>
      <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
      <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.65 }}>{desc}</Typography>
    </Box>
  </Box>
)

const CreatorLandingPage = () => {
  const [form, setForm] = useState<FormState>(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null)
  const formRef = useRef<HTMLDivElement | null>(null)

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    const links = [form.link1, form.link2].map(s => s.trim()).filter(Boolean)

    if (!form.name.trim() || !form.email.trim() || !form.whatsapp.trim() ||
        !form.platform || !form.handle.trim() || links.length === 0) {
      setSubmitResult({ ok: false, message: 'Lengkapi semua field wajib (bertanda *)' })

      return
    }

    setSubmitting(true)
    setSubmitResult(null)

    try {
      const res = await creatorApi.submitApplication({
        name: form.name.trim(),
        email: form.email.trim(),
        whatsapp: form.whatsapp.trim(),
        platform: form.platform,
        handle: form.handle.trim(),
        follower_bucket: form.follower_bucket || null,
        content_links: links,
        niche: form.niche.trim() || undefined,
        pitch: form.pitch.trim() || undefined,
      })

      setSubmitResult({ ok: true, message: res.message })
      setForm(initialForm)
    } catch (err: any) {
      setSubmitResult({ ok: false, message: err?.message || 'Gagal mengirim. Coba lagi.' })
    } finally {
      setSubmitting(false)
    }
  }

  // Sample commission calc (matches deck)
  const sampleRevenue = formatIDR(7_500_000)
  const sampleCommission = formatIDR(750_000)

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${dark} 0%, #111318 30%, #14161c 60%, ${dark} 100%)`,
        color: textPrimary,
      }}
    >
      {/* Ambient glow */}
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
        {/* Top nav */}
        <Container maxWidth='lg' sx={{ py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box component={Link} href='/' sx={{ textDecoration: 'none' }}>
            <Box component='img' src='/images/brand/wordmark.png' alt='Playfast' sx={{ height: { xs: 28, md: 34 } }} />
          </Box>
          <Button
            variant='outlined'
            size='small'
            onClick={scrollToForm}
            sx={{ borderColor: 'rgba(154,160,166,0.4)', color: textSecondary, fontWeight: 600, '&:hover': { borderColor: gold, color: gold } }}
          >
            Apply
          </Button>
        </Container>

        {/* ═══ HERO ═══ */}
        <Container maxWidth='lg' sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 6, md: 8 } }}>
          <SectionEyebrow>Playfast × Creators · Mei 2026</SectionEyebrow>
          <Typography
            variant='h1'
            sx={{
              fontWeight: 900, lineHeight: 1.02, mb: 2,
              fontSize: { xs: '2.2rem', sm: '3rem', md: '4.2rem' },
              letterSpacing: '-0.03em',
            }}
          >
            Jadi{' '}
            <Box component='span' sx={{
              background: `linear-gradient(135deg, ${goldLight} 0%, ${gold} 100%)`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Playfast Creator
            </Box>
            .
          </Typography>
          <Typography variant='h6' sx={{ color: textSecondary, mb: 2, maxWidth: 720, lineHeight: 1.5, fontWeight: 400 }}>
            Game AAA original mulai <strong style={{ color: textPrimary }}>Rp 50 ribu</strong> — bukan crack, bukan bajakan.
            Audience kamu lagi nyari ini. Kamu kasih opsi ketiga, dapet <strong style={{ color: gold }}>10% revenue share</strong>.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 5, mt: 3 }}>
            <Button
              variant='contained'
              size='large'
              onClick={scrollToForm}
              sx={{
                bgcolor: gold, color: dark, fontWeight: 800,
                px: 4, py: 1.5, fontSize: '1rem',
                boxShadow: `0 6px 24px ${gold}55`,
                '&:hover': { bgcolor: goldLight, boxShadow: `0 8px 32px ${gold}66` },
              }}
            >
              Apply Sekarang
            </Button>
            <Button
              component='a'
              href='#how-it-works'
              variant='outlined'
              size='large'
              sx={{ borderColor: 'rgba(154,160,166,0.4)', color: textSecondary, fontWeight: 600, px: 4, '&:hover': { borderColor: gold, color: gold } }}
            >
              Lihat Detail Programnya
            </Button>
          </Box>

          {/* 3 stat grid */}
          <Grid container spacing={{ xs: 3, md: 5 }} sx={{ pt: 4, borderTop: `1px solid ${darkCardBorder}` }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <StatBlock value='Rp 50K+' label='Per game · akses lifetime' />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <StatBlock value='80%' label='Lebih murah dari Steam asli' />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <StatBlock value='100%' label='Akun Steam original — legit' />
            </Grid>
          </Grid>
        </Container>

        {/* ═══ WHY YOUR AUDIENCE CARES ═══ */}
        <Box sx={{ bgcolor: 'rgba(0,0,0,0.3)', py: { xs: 6, md: 10 } }}>
          <Container maxWidth='lg'>
            <SectionEyebrow>The Hook</SectionEyebrow>
            <Typography variant='h3' sx={{ fontWeight: 800, mb: 4, fontSize: { xs: '1.7rem', md: '2.4rem' }, lineHeight: 1.2 }}>
              Audience kamu lagi pilih: <Box component='span' sx={{ color: gold }}>bayar mahal</Box>,
              <br />atau <Box component='span' sx={{ color: '#ff6b6b' }}>bajak</Box>. Kamu kasih opsi ketiga.
            </Typography>

            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: gold, mb: 1, letterSpacing: '-0.02em' }}>Rp 600-900K</Typography>
                    <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.6 }}>
                      Harga rata-rata game AAA modern di Steam Indonesia. Naik terus tiap rilis.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: gold, mb: 1, letterSpacing: '-0.02em' }}>~70%</Typography>
                    <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.6 }}>
                      Gamer Indonesia masih akses game premium via metode ilegal — karena harga resmi tidak terjangkau.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: gold, mb: 1, letterSpacing: '-0.02em' }}>100M+</Typography>
                    <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.6 }}>
                      Total gamer Indonesia — pasar terbesar di Asia Tenggara. Kamu duduk di tengah-tengahnya.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* ═══ HOW IT WORKS ═══ */}
        <Container maxWidth='lg' sx={{ py: { xs: 6, md: 10 } }} id='how-it-works'>
          <SectionEyebrow>How It Works</SectionEyebrow>
          <Typography variant='h3' sx={{ fontWeight: 800, mb: 5, fontSize: { xs: '1.7rem', md: '2.4rem' }, lineHeight: 1.2 }}>
            Simpel: checkout → login → main offline.
          </Typography>

          <Grid container spacing={{ xs: 3, md: 4 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <StepRow num='01' title='Customer checkout di playfast.id' desc='Bayar transfer mulai Rp 50K. Akses lifetime per game, atau subscribe untuk semua katalog.' />
                <StepRow num='02' title='Dapat kredensial Steam + OTP otomatis' desc='Tanpa install Steam Mobile App — kode Steam Guard di-generate di halaman order. Refresh tiap 30 detik.' />
                <StepRow num='03' title='Login → install → Go Offline' desc='Setelah download selesai, switch ke Mode Offline. Akun dipakai user lain bergantian.' />
                <StepRow num='04' title='Main sepuasnya, single-player' desc='Save game tetap di lokal. Tidak ada subscription paksa, tidak ada akun aneh-aneh.' />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              {/* Mockup ID card */}
              <Card sx={{
                bgcolor: darkCard, border: `1px solid ${gold}`, p: 0, overflow: 'hidden',
                boxShadow: `0 12px 40px ${gold}22`,
              }}>
                <Box sx={{ bgcolor: 'rgba(0,0,0,0.4)', px: 2.5, py: 1.5, borderBottom: `1px solid ${darkCardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant='caption' sx={{ color: textSecondary, letterSpacing: '0.1em', fontFamily: 'monospace' }}>PLAYFAST.ID · ORDER #4821</Typography>
                  <Typography variant='caption' sx={{ color: gold, fontWeight: 700 }}>LIFETIME</Typography>
                </Box>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 0.5 }}>CYBERPUNK 2077</Typography>
                  <Typography variant='caption' sx={{ color: textSecondary, mb: 3, display: 'block' }}>Akun siap.</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                      <Typography variant='caption' sx={{ color: textSecondary, display: 'block', letterSpacing: '0.08em' }}>USERNAME</Typography>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600 }}>play_seven_xv</Typography>
                    </Box>
                    <Box>
                      <Typography variant='caption' sx={{ color: textSecondary, display: 'block', letterSpacing: '0.08em' }}>PASSWORD</Typography>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600, color: textSecondary }}>••••••••••••</Typography>
                    </Box>
                    <Box sx={{ pt: 1.5, borderTop: `1px dashed ${darkCardBorder}` }}>
                      <Typography variant='caption' sx={{ color: gold, display: 'block', letterSpacing: '0.08em', fontWeight: 700 }}>STEAM GUARD CODE</Typography>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 900, color: gold, letterSpacing: '0.1em' }}>7K2-9X4</Typography>
                      <Typography variant='caption' sx={{ color: textSecondary, fontSize: '0.7rem' }}>Refresh tiap 30 detik</Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>

        {/* ═══ THE DEAL · COMMISSION ═══ */}
        <Box sx={{ bgcolor: 'rgba(0,0,0,0.3)', py: { xs: 6, md: 10 } }}>
          <Container maxWidth='lg'>
            <SectionEyebrow>The Deal · Win-Win-Win</SectionEyebrow>
            <Typography variant='h3' sx={{ fontWeight: 800, mb: 5, fontSize: { xs: '1.7rem', md: '2.4rem' }, lineHeight: 1.2 }}>
              <Box component='span' sx={{ color: gold }}>20% off</Box> untuk audience.
              <br /><Box component='span' sx={{ color: gold }}>10% revenue share</Box> buat kamu.
            </Typography>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant='overline' sx={{ color: textSecondary, letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.7rem' }}>Customer kamu dapat</Typography>
                    <Typography sx={{ fontSize: '3rem', fontWeight: 900, color: gold, lineHeight: 1, my: 1.5, letterSpacing: '-0.03em' }}>−20%</Typography>
                    <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.65 }}>
                      Diskon langsung di checkout pakai promo code kamu. Game Rp 100K → Rp 80K. <strong style={{ color: textPrimary }}>No fine print.</strong>
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{
                  background: `linear-gradient(135deg, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.05) 100%)`,
                  border: `1px solid ${gold}`, height: '100%',
                  boxShadow: `0 8px 32px ${gold}22`,
                }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant='overline' sx={{ color: gold, letterSpacing: '0.1em', fontWeight: 800, fontSize: '0.7rem' }}>Kamu dapat</Typography>
                    <Typography sx={{ fontSize: '3rem', fontWeight: 900, color: gold, lineHeight: 1, my: 1.5, letterSpacing: '-0.03em' }}>10%</Typography>
                    <Typography variant='body2' sx={{ color: '#d8dee6', lineHeight: 1.65 }}>
                      Revenue share dari setiap order yang pakai promo code kamu. <strong style={{ color: textPrimary }}>Trackable, transparent, dibayar tiap bulan.</strong>
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant='overline' sx={{ color: textSecondary, letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.7rem' }}>Tracking</Typography>
                    <Typography sx={{ fontSize: '3rem', fontWeight: 900, color: gold, lineHeight: 1, my: 1.5, letterSpacing: '-0.03em' }}>∞</Typography>
                    <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.65 }}>
                      Lifetime attribution per code. Selama customer pakai code-mu, <strong style={{ color: textPrimary }}>semua repeat order tetap masuk hitungan kamu.</strong>
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Sample calc */}
            <Card sx={{ mt: 4, bgcolor: 'rgba(0,0,0,0.4)', border: `1px dashed ${gold}66` }}>
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant='overline' sx={{ color: gold, letterSpacing: '0.12em', fontWeight: 700, fontSize: '0.7rem' }}>Contoh kalkulasi</Typography>
                <Typography sx={{ mt: 1, fontSize: { xs: '1rem', md: '1.15rem' }, color: textPrimary, lineHeight: 1.7 }}>
                  <strong>100 sales</strong> × Rp 75K avg = <strong style={{ color: gold }}>{sampleRevenue}</strong> revenue
                  <br />→ kamu dapat <strong style={{ color: gold, fontSize: '1.4rem' }}>{sampleCommission}/bulan</strong> tanpa rekam ulang konten.
                </Typography>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* ═══ WORKFLOW ═══ */}
        <Container maxWidth='lg' sx={{ py: { xs: 6, md: 10 } }}>
          <SectionEyebrow>Workflow</SectionEyebrow>
          <Typography variant='h3' sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1.7rem', md: '2.4rem' }, lineHeight: 1.2 }}>
            Lightweight. Fokus konten, bukan birokrasi.
          </Typography>
          <Typography sx={{ color: textSecondary, mb: 5 }}>5 langkah dari apply ke pembayaran pertama.</Typography>

          <Grid container spacing={3}>
            {[
              { num: '01', title: 'Apply', desc: 'Isi form di bawah. Drop 2 link konten terbaik kamu.', color: gold },
              { num: '02', title: 'Onboard', desc: 'Dapat promo code personal + akun trial gratis untuk demo. Briefing Q&A 15 menit kalau perlu.', color: gold },
              { num: '03', title: 'Bikin', desc: 'Bikin konten sesuai gaya kamu. Kirim draft untuk fact-check (24 jam turnaround).', color: gold },
              { num: '04', title: 'Publish', desc: 'Publish di akun kamu. Tag @playfast.id biar gampang di-repost ke story Playfast.', color: gold },
              { num: '05', title: 'Bayar', desc: 'Revenue share 10% dibayar tiap awal bulan. Dashboard tracking di-share via email.', color: '#4caf50' },
            ].map(s => (
              <Grid size={{ xs: 12, md: 6, lg: 4 }} key={s.num}>
                <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <StepRow num={s.num} title={s.title} desc={s.desc} color={s.color} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Boundaries note */}
          <Card sx={{ mt: 4, bgcolor: 'rgba(0,0,0,0.25)', border: `1px solid ${darkCardBorder}` }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant='overline' sx={{ color: gold, letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.7rem', display: 'block', mb: 1 }}>
                Boundaries · what we ask
              </Typography>
              <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.65 }}>
                <strong style={{ color: textPrimary }}>No exclusivity.</strong> Kamu tetap boleh review platform lain. Cuma jangan endorse direct competitor di window 14 hari setelah konten Playfast tayang.
                Deliverable minimum: <strong style={{ color: textPrimary }}>1 video utama</strong> (faceless atau on-camera) + 1 story repost + caption mention di first-line.
              </Typography>
            </CardContent>
          </Card>
        </Container>

        {/* ═══ TRUST · WHY IT'S LEGIT ═══ */}
        <Box sx={{ bgcolor: 'rgba(0,0,0,0.3)', py: { xs: 6, md: 10 } }}>
          <Container maxWidth='lg'>
            <SectionEyebrow>Trust Signals · Kenapa Legit</SectionEyebrow>
            <Typography variant='h3' sx={{ fontWeight: 800, mb: 4, fontSize: { xs: '1.7rem', md: '2.4rem' }, lineHeight: 1.2 }}>
              Bukan crack. Bukan curian.<br />Bukan akun gratis-an.
            </Typography>

            <Grid container spacing={3}>
              {[
                { label: 'Origin', title: 'Akun original Steam', desc: 'Playfast beli akun Steam yang berisi banyak game premium — pakai uang sendiri, dari sumber legitimate.' },
                { label: 'Model', title: 'Sharing, bukan transfer', desc: 'Yang dilarang Steam ToS adalah jual / transfer ownership akun. Sharing kredensial sendiri tidak dilarang.' },
                { label: 'Mitigation', title: 'Mode Offline aturan utama', desc: 'Setelah install, user pindah ke Mode Offline → akun aman dari Steam flag, user lain bisa pakai bergantian.' },
                { label: 'Track Record', title: 'Sudah operational', desc: 'playfast.id sudah jalan: order, fulfillment, OTP automation, support, refund policy — semuanya production.' },
              ].map((it, idx) => (
                <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
                  <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}`, height: '100%' }}>
                    <CardContent sx={{ p: 3 }}>
                      <Typography variant='overline' sx={{ color: gold, letterSpacing: '0.1em', fontWeight: 700, fontSize: '0.65rem' }}>{`0${idx + 1} · ${it.label}`}</Typography>
                      <Typography variant='subtitle1' sx={{ fontWeight: 700, mt: 0.5, mb: 1 }}>{it.title}</Typography>
                      <Typography variant='body2' sx={{ color: textSecondary, lineHeight: 1.6, fontSize: '0.85rem' }}>{it.desc}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Alert
              severity='info'
              icon={<i className='tabler-info-circle' style={{ fontSize: 20, color: gold }} />}
              sx={{
                mt: 4, bgcolor: 'rgba(201,168,76,0.06)',
                border: `1px solid ${gold}44`, color: textSecondary,
                '& .MuiAlert-icon': { color: gold },
              }}
            >
              <strong style={{ color: textPrimary }}>Catatan jujur:</strong> Steam tetap bisa flag akun kapan pun.
              Kita tidak janji &ldquo;100% no risk&rdquo; — kita janjikan mitigasi yang ketat dan refund policy yang fair.
            </Alert>
          </Container>
        </Box>

        {/* ═══ APPLY FORM ═══ */}
        <Container maxWidth='md' sx={{ py: { xs: 6, md: 10 } }} ref={formRef}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <SectionEyebrow>Apply</SectionEyebrow>
            <Typography variant='h3' sx={{ fontWeight: 800, mb: 1.5, fontSize: { xs: '1.7rem', md: '2.4rem' }, lineHeight: 1.2 }}>
              Mari main hemat,<br />bareng-bareng.
            </Typography>
            <Typography sx={{ color: textSecondary, maxWidth: 540, mx: 'auto', lineHeight: 1.6 }}>
              Isi form ini, tim Playfast akan kontak via WhatsApp/email dalam 1–2 hari kerja.
              Setelah onboarding, kamu langsung dapat promo code + akun trial gratis untuk demo.
            </Typography>
          </Box>

          <Card sx={{ bgcolor: darkCard, border: `1px solid ${darkCardBorder}` }}>
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <form onSubmit={handleSubmit} autoComplete='off'>
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth required label='Nama lengkap *' value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 200 } }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth required type='email' label='Email *' value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 255 } }} />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth required label='WhatsApp *' placeholder='+62 822-...' value={form.whatsapp}
                      onChange={e => setForm({ ...form, whatsapp: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 50 } }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField select fullWidth required label='Platform utama *' value={form.platform}
                      onChange={e => setForm({ ...form, platform: e.target.value as CreatorPlatform })}>
                      {platforms.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                    </TextField>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth required label='Username / Handle *' placeholder='@username atau nama channel'
                      value={form.handle}
                      onChange={e => setForm({ ...form, handle: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 200 } }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField select fullWidth label='Jumlah follower' value={form.follower_bucket}
                      onChange={e => setForm({ ...form, follower_bucket: e.target.value as CreatorFollowerBucket })}>
                      <MenuItem value=''>—</MenuItem>
                      {followerBuckets.map(b => <MenuItem key={b} value={b}>{b}</MenuItem>)}
                    </TextField>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <TextField fullWidth required label='Link konten terbaik #1 *' placeholder='https://tiktok.com/...'
                      value={form.link1}
                      onChange={e => setForm({ ...form, link1: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 500 } }} />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField fullWidth label='Link konten terbaik #2 (opsional)' placeholder='https://instagram.com/...'
                      value={form.link2}
                      onChange={e => setForm({ ...form, link2: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 500 } }} />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <TextField fullWidth label='Niche / jenis konten' placeholder='Mis. game review, gaming budget, JRPG'
                      value={form.niche}
                      onChange={e => setForm({ ...form, niche: e.target.value })}
                      slotProps={{ htmlInput: { maxLength: 200 } }} />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <TextField fullWidth multiline minRows={3} maxRows={6}
                      label='Kenapa kamu cocok untuk Playfast?'
                      placeholder='Audience kamu sering nanya soal harga game? Spesialis game-deal? Cerita singkat saja.'
                      value={form.pitch}
                      onChange={e => setForm({ ...form, pitch: e.target.value.slice(0, 1000) })}
                      helperText={`${form.pitch.length}/1000`}
                      slotProps={{ htmlInput: { maxLength: 1000 } }} />
                  </Grid>

                  {submitResult && (
                    <Grid size={{ xs: 12 }}>
                      <Alert severity={submitResult.ok ? 'success' : 'error'}>
                        {submitResult.message}
                      </Alert>
                    </Grid>
                  )}

                  <Grid size={{ xs: 12 }}>
                    <Button
                      type='submit'
                      variant='contained'
                      size='large'
                      fullWidth
                      disabled={submitting}
                      sx={{
                        bgcolor: gold, color: dark, fontWeight: 800, py: 1.5, fontSize: '1rem',
                        boxShadow: `0 6px 24px ${gold}55`,
                        '&:hover': { bgcolor: goldLight, boxShadow: `0 8px 32px ${gold}66` },
                        '&.Mui-disabled': { bgcolor: 'rgba(201,168,76,0.3)', color: 'rgba(0,0,0,0.5)' },
                      }}
                    >
                      {submitting ? 'Mengirim...' : 'Kirim Aplikasi'}
                    </Button>
                    <Typography variant='caption' sx={{ display: 'block', textAlign: 'center', color: textSecondary, mt: 1.5 }}>
                      Dengan submit, kamu setuju Playfast boleh hubungi kamu via WhatsApp/email untuk proses partnership.
                    </Typography>
                  </Grid>
                </Grid>
              </form>
            </CardContent>
          </Card>
        </Container>

        {/* ═══ FOOTER ═══ */}
        <Box sx={{ borderTop: `1px solid ${darkCardBorder}`, py: 4 }}>
          <Container maxWidth='lg'>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography variant='caption' sx={{ color: textSecondary, letterSpacing: '0.1em', display: 'block', fontWeight: 700 }}>PLAYFAST CREATOR PROGRAM 2026</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Typography variant='caption' sx={{ color: textSecondary }}>
                  Partnership lead: <strong style={{ color: textPrimary }}>Tim Playfast</strong>
                </Typography>
                <Box component='a' href='mailto:admin@playfast.id' sx={{ color: gold, textDecoration: 'none', fontSize: '0.75rem' }}>
                  admin@playfast.id
                </Box>
                <Box component={Link} href='/' sx={{ color: textSecondary, textDecoration: 'none', fontSize: '0.75rem', '&:hover': { color: gold } }}>
                  playfast.id
                </Box>
              </Box>
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>
  )
}

export default CreatorLandingPage
