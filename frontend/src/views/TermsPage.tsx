'use client'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

const TermsPage = () => {
  return (
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0e17 0%, #101926 20%, #1b2838 50%, #1b2838 100%)' }}>
      <Container maxWidth='md' sx={{ py: 6 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Link href='/'>
            <Box component='img' src='/images/brand/wordmark.png' alt='Playfast' sx={{ height: 34 }} />
          </Link>
        </Box>

        <Card sx={{ bgcolor: 'rgba(30,42,58,0.7)', border: '1px solid rgba(42,63,85,0.6)' }}>
          <CardContent sx={{ p: { xs: 3, md: 5 } }}>
            <Typography variant='h4' sx={{ fontWeight: 700, mb: 1 }}>
              Syarat dan Ketentuan
            </Typography>
            <Typography variant='body2' sx={{ color: '#8f98a0', mb: 4 }}>
              Terakhir diperbarui: April 2026
            </Typography>
            <Divider sx={{ mb: 4, borderColor: 'rgba(42,63,85,0.6)' }} />

            {/* Section 1 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              1. Definisi Layanan
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 1, lineHeight: 1.8 }}>
              Playfast adalah platform yang menyediakan akses ke game-game Steam melalui sistem akun bersama (shared account). Dengan menggunakan layanan kami, pengguna dapat memainkan game-game Steam tertentu tanpa harus membeli game tersebut secara langsung di Steam Store dengan harga penuh.
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              Layanan ini mencakup penyediaan kredensial akun Steam (username dan password), serta kode Steam Guard yang di-generate secara otomatis untuk keperluan autentikasi dua faktor saat login.
            </Typography>

            {/* Section 2 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              2. Syarat Penggunaan
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li>Pengguna harus berusia minimal 17 (tujuh belas) tahun untuk menggunakan layanan Playfast.</li>
                <li>Pengguna wajib menjaga kerahasiaan kredensial akun Playfast miliknya (email dan password).</li>
                <li>Pengguna <strong>dilarang keras</strong> mengubah password akun Steam yang disediakan oleh Playfast.</li>
                <li>Pengguna <strong>wajib</strong> memainkan game dalam mode offline (Steam Offline Mode) sesuai dengan panduan yang diberikan.</li>
                <li>Pengguna bertanggung jawab penuh atas aktivitas yang dilakukan melalui akun Playfast miliknya.</li>
                <li>Setiap pengguna hanya diperkenankan memiliki satu akun Playfast.</li>
              </Box>
            </Typography>

            {/* Section 3 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              3. Pembayaran dan Akses
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li>Pembayaran dilakukan secara sekali bayar (one-time payment) untuk setiap game yang dibeli.</li>
                <li>Setelah pembayaran berhasil dikonfirmasi, pengguna akan mendapatkan akses selamanya ke game yang dibeli selama akun Steam terkait masih aktif dan tersedia.</li>
                <li>Playfast berhak mencabut akses pengguna apabila ditemukan pelanggaran terhadap Syarat dan Ketentuan ini, tanpa kewajiban pengembalian dana.</li>
                <li>Harga game dapat berubah sewaktu-waktu tanpa pemberitahuan terlebih dahulu. Perubahan harga tidak berlaku untuk pembelian yang sudah selesai.</li>
              </Box>
            </Typography>

            {/* Section 4 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              4. Larangan
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 1, lineHeight: 1.8 }}>
              Pengguna dilarang melakukan hal-hal berikut:
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li>Membagikan kredensial akun Steam yang diberikan oleh Playfast kepada pihak lain.</li>
                <li>Mengubah pengaturan akun Steam, termasuk namun tidak terbatas pada: password, email, nomor telepon, pengaturan privasi, atau nama profil.</li>
                <li>Melakukan pembelian (purchase) apapun menggunakan akun Steam yang disediakan.</li>
                <li>Menggunakan cheat, exploit, atau perangkat lunak pihak ketiga yang melanggar ketentuan Steam Subscriber Agreement.</li>
                <li>Menjual kembali akses yang diperoleh dari Playfast kepada pihak ketiga.</li>
                <li>Melakukan tindakan yang dapat mengakibatkan akun Steam terkena banned atau dibatasi oleh Valve.</li>
              </Box>
            </Typography>

            {/* Section 5 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              5. Batasan Tanggung Jawab
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li>Playfast <strong>tidak bertanggung jawab</strong> atas banned, suspend, atau pembatasan yang dilakukan oleh Valve/Steam terhadap akun Steam yang digunakan, terlepas dari penyebabnya.</li>
                <li>Playfast tidak menjamin ketersediaan layanan secara terus-menerus tanpa gangguan. Layanan dapat mengalami downtime untuk pemeliharaan atau perbaikan.</li>
                <li>Playfast tidak bertanggung jawab atas kerugian langsung maupun tidak langsung yang dialami pengguna terkait penggunaan layanan.</li>
                <li>Playfast tidak berafiliasi, didukung, atau disponsori oleh Valve Corporation atau Steam.</li>
              </Box>
            </Typography>

            {/* Section 6 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              6. Perubahan Ketentuan
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              Playfast berhak mengubah, memperbarui, atau merevisi Syarat dan Ketentuan ini sewaktu-waktu tanpa pemberitahuan terlebih dahulu. Perubahan akan berlaku efektif sejak dipublikasikan di halaman ini. Dengan terus menggunakan layanan Playfast setelah perubahan dipublikasikan, pengguna dianggap telah menyetujui ketentuan yang diperbarui.
            </Typography>

            {/* Section 7 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              7. Kontak
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 2, lineHeight: 1.8 }}>
              Jika Anda memiliki pertanyaan mengenai Syarat dan Ketentuan ini, silakan hubungi kami melalui:
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li>
                  WhatsApp:{' '}
                  <a href='https://wa.me/6282240708329' target='_blank' rel='noopener noreferrer' style={{ color: '#c9a84c' }}>
                    +62 822-4070-8329
                  </a>
                </li>
                <li>
                  Email:{' '}
                  <a href='mailto:support@playfast.id' style={{ color: '#c9a84c' }}>
                    support@playfast.id
                  </a>
                </li>
              </Box>
            </Typography>

            <Divider sx={{ mb: 3, borderColor: 'rgba(42,63,85,0.6)' }} />

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button component={Link} href='/kebijakan-privasi' variant='outlined' size='small' sx={{ borderColor: '#3d5a80', color: '#c7d5e0' }}>
                Kebijakan Privasi
              </Button>
              <Button component={Link} href='/bantuan' variant='outlined' size='small' sx={{ borderColor: '#3d5a80', color: '#c7d5e0' }}>
                Bantuan
              </Button>
              <Button component={Link} href='/' variant='text' size='small' sx={{ color: '#8f98a0' }}>
                Kembali ke Beranda
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  )
}

export default TermsPage
