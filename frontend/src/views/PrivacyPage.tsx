'use client'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

const PrivacyPage = () => {
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
              Kebijakan Privasi
            </Typography>
            <Typography variant='body2' sx={{ color: '#8f98a0', mb: 4 }}>
              Terakhir diperbarui: April 2026
            </Typography>
            <Divider sx={{ mb: 4, borderColor: 'rgba(42,63,85,0.6)' }} />

            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              Playfast berkomitmen untuk melindungi privasi pengguna. Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, menyimpan, dan melindungi informasi pribadi Anda saat menggunakan layanan kami.
            </Typography>

            {/* Section 1 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              1. Data yang Kami Kumpulkan
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 1, lineHeight: 1.8 }}>
              Saat Anda menggunakan layanan Playfast, kami mengumpulkan data berikut:
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li><strong>Alamat email</strong> — digunakan sebagai identitas akun dan untuk komunikasi terkait layanan.</li>
                <li><strong>Password terenkripsi</strong> — password Anda disimpan dalam bentuk hash yang terenkripsi. Kami tidak dapat melihat atau memulihkan password asli Anda.</li>
                <li><strong>Riwayat pesanan</strong> — catatan game yang dibeli, tanggal pembelian, dan status pembayaran.</li>
                <li><strong>Log kode Steam Guard</strong> — catatan kapan kode Steam Guard di-generate untuk keperluan keamanan dan audit.</li>
                <li><strong>Alamat IP</strong> — dicatat saat login untuk keperluan keamanan dan deteksi aktivitas mencurigakan.</li>
              </Box>
            </Typography>

            {/* Section 2 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              2. Penggunaan Data
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 1, lineHeight: 1.8 }}>
              Data yang dikumpulkan digunakan untuk:
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li><strong>Menyediakan layanan</strong> — memproses pesanan, memberikan akses game, dan generate kode Steam Guard.</li>
                <li><strong>Keamanan akun</strong> — mendeteksi dan mencegah akses tidak sah, penyalahgunaan, atau aktivitas mencurigakan.</li>
                <li><strong>Analitik internal</strong> — memahami penggunaan layanan untuk peningkatan kualitas dan pengembangan fitur baru.</li>
                <li><strong>Komunikasi</strong> — mengirim informasi penting terkait akun, perubahan layanan, atau pembaruan kebijakan.</li>
              </Box>
            </Typography>

            {/* Section 3 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              3. Penyimpanan Data
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li>Data pengguna disimpan di server yang aman dengan enkripsi standar industri.</li>
                <li>Kami <strong>tidak menjual, menyewakan, atau membagikan</strong> data pribadi Anda kepada pihak ketiga untuk tujuan komersial.</li>
                <li>Data hanya akan dibagikan kepada pihak berwenang apabila diwajibkan oleh hukum yang berlaku.</li>
                <li>Kami menerapkan langkah-langkah keamanan teknis dan organisasi yang wajar untuk melindungi data Anda dari akses tidak sah, kehilangan, atau penyalahgunaan.</li>
              </Box>
            </Typography>

            {/* Section 4 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              4. Hak Pengguna
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 1, lineHeight: 1.8 }}>
              Sebagai pengguna, Anda memiliki hak-hak berikut:
            </Typography>
            <Typography variant='body1' component='div' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              <Box component='ul' sx={{ pl: 3, '& li': { mb: 1 } }}>
                <li><strong>Hak akses</strong> — Anda berhak mengetahui data apa saja yang kami simpan tentang Anda.</li>
                <li><strong>Hak penghapusan</strong> — Anda dapat meminta penghapusan akun dan seluruh data terkait dengan menghubungi kami. Proses penghapusan akan dilakukan dalam waktu maksimal 30 hari kerja.</li>
                <li><strong>Hak ekspor data</strong> — Anda dapat meminta salinan data pribadi Anda dalam format yang dapat dibaca.</li>
                <li><strong>Hak koreksi</strong> — Anda berhak meminta perbaikan atas data yang tidak akurat.</li>
              </Box>
            </Typography>

            {/* Section 5 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              5. Cookie
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              Playfast menggunakan cookie untuk keperluan sesi login dan autentikasi. Cookie ini diperlukan agar layanan dapat berfungsi dengan baik. Kami tidak menggunakan cookie pihak ketiga untuk pelacakan iklan. Dengan menggunakan layanan kami, Anda menyetujui penggunaan cookie yang diperlukan untuk operasional layanan.
            </Typography>

            {/* Section 6 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              6. Perubahan Kebijakan
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 4, lineHeight: 1.8 }}>
              Playfast berhak memperbarui Kebijakan Privasi ini sewaktu-waktu. Perubahan akan dipublikasikan di halaman ini dengan tanggal pembaruan terbaru. Kami menyarankan pengguna untuk meninjau halaman ini secara berkala. Penggunaan layanan secara berkelanjutan setelah perubahan dipublikasikan dianggap sebagai persetujuan terhadap kebijakan yang diperbarui.
            </Typography>

            {/* Section 7 */}
            <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
              7. Kontak
            </Typography>
            <Typography variant='body1' sx={{ color: '#c7d5e0', mb: 2, lineHeight: 1.8 }}>
              Jika Anda memiliki pertanyaan atau permintaan terkait Kebijakan Privasi ini, silakan hubungi kami melalui:
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
              <Button component={Link} href='/syarat-ketentuan' variant='outlined' size='small' sx={{ borderColor: '#3d5a80', color: '#c7d5e0' }}>
                Syarat dan Ketentuan
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

export default PrivacyPage
