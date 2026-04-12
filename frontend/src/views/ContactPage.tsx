'use client'

import { useState } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Collapse from '@mui/material/Collapse'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

const ContactPage = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const faqs = [
    {
      q: 'Bagaimana cara main game yang sudah dibeli?',
      a: 'Setelah pembelian dikonfirmasi, buka halaman "Game Saya" di dashboard. Klik game yang ingin dimainkan, lalu klik "Generate Kode Steam Guard". Gunakan username, password, dan kode guard yang diberikan untuk login ke Steam. Setelah login, download game-nya, lalu masuk ke mode offline (Steam > Go Offline) dan mulai bermain.',
    },
    {
      q: 'Apa itu kode Steam Guard?',
      a: 'Steam Guard adalah fitur keamanan dua faktor (2FA) dari Steam. Setiap kali login dari perangkat baru, Steam meminta kode verifikasi tambahan. Playfast menyediakan kode ini secara otomatis untuk Anda, sehingga Anda bisa langsung login tanpa menunggu kode dari pemilik akun.',
    },
    {
      q: 'Kenapa harus main offline?',
      a: 'Karena akun Steam yang digunakan bersifat shared (digunakan oleh lebih dari satu orang), mode offline diperlukan agar tidak terjadi konflik saat ada pengguna lain yang juga menggunakan akun yang sama. Dalam mode offline, Anda tetap bisa memainkan game single-player secara penuh tanpa gangguan.',
    },
    {
      q: 'Berapa lama akses game berlaku?',
      a: 'Akses berlaku selamanya. Setelah Anda membeli akses ke sebuah game, Anda bisa generate kode Steam Guard dan memainkannya kapan saja tanpa batas waktu. Tidak ada biaya berlangganan atau perpanjangan.',
    },
    {
      q: 'Bagaimana jika kode Steam Guard tidak bisa digunakan?',
      a: 'Kode Steam Guard memiliki masa berlaku singkat (sekitar 30 detik). Pastikan Anda menggunakan kode segera setelah di-generate. Jika kode sudah expired, cukup generate kode baru dari halaman Play. Jika masalah berlanjut, hubungi admin melalui WhatsApp.',
    },
    {
      q: 'Apakah bisa main online/multiplayer?',
      a: 'Playfast dirancang utamanya untuk game single-player/offline. Karena akun digunakan bersama, fitur online multiplayer mungkin terbatas atau tidak tersedia. Kami menyarankan penggunaan Playfast untuk game story-driven dan single-player.',
    },
    {
      q: 'Bagaimana cara pembayaran?',
      a: 'Setelah memilih game yang ingin dibeli, Anda akan diarahkan ke proses checkout. Pembayaran dapat dilakukan melalui transfer bank atau e-wallet. Setelah pembayaran dikonfirmasi oleh admin, akses game akan langsung tersedia di akun Anda.',
    },
    {
      q: 'Apakah akun saya bisa di-banned?',
      a: 'Akun Playfast Anda bisa dinonaktifkan jika Anda melanggar Syarat dan Ketentuan, seperti mengubah password akun Steam, membagikan kredensial ke orang lain, atau menggunakan cheat. Pastikan Anda mengikuti aturan penggunaan yang berlaku.',
    },
    {
      q: 'Bagaimana jika lupa password Playfast?',
      a: 'Saat ini, fitur reset password otomatis belum tersedia. Jika Anda lupa password akun Playfast, silakan hubungi admin melalui WhatsApp untuk bantuan pemulihan akun.',
    },
    {
      q: 'Apakah data saya aman?',
      a: 'Ya. Kami menyimpan password dalam bentuk terenkripsi dan tidak pernah menjual data pengguna ke pihak ketiga. Untuk informasi lengkap, silakan baca Kebijakan Privasi kami.',
    },
  ]

  return (
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0e17 0%, #101926 20%, #1b2838 50%, #1b2838 100%)' }}>
      <Container maxWidth='md' sx={{ py: 6 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Link href='/'>
            <Box component='img' src='/images/brand/wordmark.png' alt='Playfast' sx={{ height: 34 }} />
          </Link>
        </Box>

        {/* Page Title */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant='h3' sx={{ fontWeight: 700, mb: 1.5 }}>
            Butuh Bantuan?
          </Typography>
          <Typography variant='h6' sx={{ color: '#8f98a0', fontWeight: 400, maxWidth: 500, mx: 'auto', lineHeight: 1.6 }}>
            Kami siap membantu kamu. Pilih cara yang paling nyaman untuk menghubungi kami atau cek FAQ di bawah.
          </Typography>
        </Box>

        {/* Contact Cards */}
        <Grid container spacing={3} sx={{ mb: 6 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Card
              sx={{
                bgcolor: 'rgba(30,42,58,0.7)',
                border: '1px solid rgba(42,63,85,0.6)',
                height: '100%',
                transition: 'all 0.3s ease',
                '&:hover': { borderColor: 'rgba(37,211,102,0.5)', transform: 'translateY(-2px)' },
              }}
            >
              <CardContent sx={{ textAlign: 'center', py: 4, px: 3 }}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    mx: 'auto',
                    mb: 2.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(37,211,102,0.15) 0%, rgba(37,211,102,0.05) 100%)',
                    border: '1px solid rgba(37,211,102,0.3)',
                  }}
                >
                  <i className='tabler-brand-whatsapp' style={{ fontSize: 32, color: '#25D366' }} />
                </Box>
                <Typography variant='h6' sx={{ fontWeight: 700, mb: 1 }}>
                  WhatsApp
                </Typography>
                <Typography variant='body2' sx={{ color: '#8f98a0', mb: 2.5, lineHeight: 1.6 }}>
                  Respon cepat di jam operasional. Cocok untuk pertanyaan urgent atau masalah akses.
                </Typography>
                <Button
                  component='a'
                  href='https://wa.me/6282240708329'
                  target='_blank'
                  rel='noopener noreferrer'
                  variant='contained'
                  sx={{
                    bgcolor: '#25D366',
                    '&:hover': { bgcolor: '#1da851' },
                    fontWeight: 600,
                  }}
                  startIcon={<i className='tabler-brand-whatsapp' />}
                >
                  Chat Sekarang
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Card
              sx={{
                bgcolor: 'rgba(30,42,58,0.7)',
                border: '1px solid rgba(42,63,85,0.6)',
                height: '100%',
                transition: 'all 0.3s ease',
                '&:hover': { borderColor: 'rgba(201,168,76,0.3)', transform: 'translateY(-2px)' },
              }}
            >
              <CardContent sx={{ textAlign: 'center', py: 4, px: 3 }}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    mx: 'auto',
                    mb: 2.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.04) 100%)',
                    border: '1px solid rgba(201,168,76,0.2)',
                  }}
                >
                  <i className='tabler-mail' style={{ fontSize: 32, color: '#c9a84c' }} />
                </Box>
                <Typography variant='h6' sx={{ fontWeight: 700, mb: 1 }}>
                  Email
                </Typography>
                <Typography variant='body2' sx={{ color: '#8f98a0', mb: 2.5, lineHeight: 1.6 }}>
                  Untuk pertanyaan umum, permintaan data, atau hal yang tidak urgent.
                </Typography>
                <Button
                  component='a'
                  href='mailto:support@playfast.id'
                  variant='outlined'
                  sx={{
                    borderColor: '#c9a84c',
                    color: '#c9a84c',
                    '&:hover': { bgcolor: 'rgba(201,168,76,0.08)', borderColor: '#c9a84c' },
                    fontWeight: 600,
                  }}
                  startIcon={<i className='tabler-mail' />}
                >
                  support@playfast.id
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* FAQ Section */}
        <Typography variant='h4' sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>
          Pertanyaan yang Sering Ditanyakan
        </Typography>
        <Typography variant='body1' sx={{ textAlign: 'center', color: '#8f98a0', mb: 4 }}>
          Jawaban untuk pertanyaan paling umum
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 5 }}>
          {faqs.map((faq, idx) => (
            <Card
              key={idx}
              sx={{
                bgcolor: 'rgba(30,42,58,0.5)',
                border: '1px solid',
                borderColor: openFaq === idx ? 'rgba(201,168,76,0.3)' : 'rgba(42,63,85,0.6)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { borderColor: 'rgba(201,168,76,0.2)' },
              }}
              onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
            >
              <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: openFaq === idx ? 2 : undefined } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                  <Typography variant='subtitle1' sx={{ fontWeight: 600 }}>
                    {faq.q}
                  </Typography>
                  <i
                    className={openFaq === idx ? 'tabler-chevron-up' : 'tabler-chevron-down'}
                    style={{ fontSize: 20, color: '#8f98a0', flexShrink: 0 }}
                  />
                </Box>
                <Collapse in={openFaq === idx}>
                  <Typography variant='body2' sx={{ color: '#8f98a0', mt: 1.5, lineHeight: 1.7 }}>
                    {faq.a}
                  </Typography>
                </Collapse>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* Bottom links */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button component={Link} href='/syarat-ketentuan' variant='outlined' size='small' sx={{ borderColor: '#3d5a80', color: '#c7d5e0' }}>
            Syarat dan Ketentuan
          </Button>
          <Button component={Link} href='/kebijakan-privasi' variant='outlined' size='small' sx={{ borderColor: '#3d5a80', color: '#c7d5e0' }}>
            Kebijakan Privasi
          </Button>
          <Button component={Link} href='/' variant='text' size='small' sx={{ color: '#8f98a0' }}>
            Kembali ke Beranda
          </Button>
        </Box>
      </Container>
    </Box>
  )
}

export default ContactPage
