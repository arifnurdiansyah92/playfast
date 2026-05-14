'use client'

import { useState, useEffect } from 'react'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Chip from '@mui/material/Chip'

import CustomTextField from '@core/components/mui/TextField'
import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminSettingsPage = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [snackMsg, setSnackMsg] = useState('')
  const [form, setForm] = useState<Record<string, string>>({})

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminApi.getSettings(),
    enabled: user?.role === 'admin'
  })

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => adminApi.updateSettings(data),
    onSuccess: (newSettings) => {
      queryClient.setQueryData(['admin-settings'], newSettings)
      setSnackMsg('Settings saved')
    },
    onError: (err: any) => setSnackMsg(`Save failed: ${err.message}`)
  })

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    saveMutation.mutate(form)
  }

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const paymentMode = form.payment_mode || 'midtrans_sandbox'

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Settings</Typography>
          <Typography color='text.secondary'>Payment gateway and site configuration</Typography>
        </Box>
        <Button
          variant='contained'
          size='large'
          startIcon={<i className='tabler-device-floppy' />}
          onClick={handleSave}
          disabled={saveMutation.isPending || isLoading}
          sx={{ fontWeight: 700, px: 4 }}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </Box>

      {/* Payment Mode */}
      <Card>
        <CardHeader
          title='Payment Mode'
          avatar={<i className='tabler-credit-card' style={{ fontSize: 24 }} />}
          action={
            <Chip
              label={
                paymentMode === 'manual'
                  ? 'Manual'
                  : paymentMode === 'tripay'
                    ? `Tripay ${form.tripay_is_production === 'true' ? 'Prod' : 'Sandbox'}`
                    : paymentMode === 'midtrans_production'
                      ? 'Midtrans Prod'
                      : 'Midtrans Sandbox'
              }
              color={
                paymentMode === 'midtrans_production' || (paymentMode === 'tripay' && form.tripay_is_production === 'true')
                  ? 'success'
                  : paymentMode === 'manual'
                    ? 'warning'
                    : 'info'
              }
              variant='tonal'
            />
          }
        />
        <Divider />
        <CardContent>
          <RadioGroup value={paymentMode} onChange={e => handleChange('payment_mode', e.target.value)}>
            <FormControlLabel
              value='midtrans_sandbox'
              control={<Radio />}
              label={
                <Box>
                  <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>Midtrans Sandbox</Typography>
                  <Typography variant='caption' color='text.secondary'>Test payments with fake credentials. No real money charged.</Typography>
                </Box>
              }
              sx={{ mb: 2, alignItems: 'flex-start', '& .MuiRadio-root': { mt: 0.5 } }}
            />
            <FormControlLabel
              value='midtrans_production'
              control={<Radio />}
              label={
                <Box>
                  <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>Midtrans Production</Typography>
                  <Typography variant='caption' color='text.secondary'>Live payments. Real money. GoPay, Bank Transfer, Credit Card, etc.</Typography>
                </Box>
              }
              sx={{ mb: 2, alignItems: 'flex-start', '& .MuiRadio-root': { mt: 0.5 } }}
            />
            <FormControlLabel
              value='tripay'
              control={<Radio />}
              label={
                <Box>
                  <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>Tripay</Typography>
                  <Typography variant='caption' color='text.secondary'>
                    Aggregator QRIS / VA / e-wallet dengan fee 0.7% + Rp 750. Order otomatis confirm via callback. Pilih sandbox/production di bawah.
                  </Typography>
                </Box>
              }
              sx={{ mb: 2, alignItems: 'flex-start', '& .MuiRadio-root': { mt: 0.5 } }}
            />
            <FormControlLabel
              value='manual'
              control={<Radio />}
              label={
                <Box>
                  <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>Manual (QRIS + WhatsApp)</Typography>
                  <Typography variant='caption' color='text.secondary'>Show QRIS code, user pays and confirms via WhatsApp. Admin confirms in dashboard.</Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', '& .MuiRadio-root': { mt: 0.5 } }}
            />
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Midtrans Sandbox Keys */}
      {paymentMode === 'midtrans_sandbox' && (
        <Card>
          <CardHeader title='Midtrans Sandbox Keys' avatar={<i className='tabler-key' style={{ fontSize: 24 }} />} />
          <Divider />
          <CardContent>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                <CustomTextField fullWidth label='Merchant ID' value={form.midtrans_merchant_id || ''} onChange={e => handleChange('midtrans_merchant_id', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <CustomTextField fullWidth label='Server Key' value={form.midtrans_sandbox_server_key || ''} onChange={e => handleChange('midtrans_sandbox_server_key', e.target.value)} placeholder='SB-Mid-server-...' />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <CustomTextField fullWidth label='Client Key' value={form.midtrans_sandbox_client_key || ''} onChange={e => handleChange('midtrans_sandbox_client_key', e.target.value)} placeholder='SB-Mid-client-...' />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Midtrans Production Keys */}
      {paymentMode === 'midtrans_production' && (
        <Card>
          <CardHeader title='Midtrans Production Keys' avatar={<i className='tabler-key' style={{ fontSize: 24 }} />} />
          <Divider />
          <CardContent>
            <Alert severity='warning' sx={{ mb: 3 }}>Production mode — real money will be charged.</Alert>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                <CustomTextField fullWidth label='Merchant ID' value={form.midtrans_merchant_id || ''} onChange={e => handleChange('midtrans_merchant_id', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <CustomTextField fullWidth label='Server Key' value={form.midtrans_production_server_key || ''} onChange={e => handleChange('midtrans_production_server_key', e.target.value)} placeholder='Mid-server-...' />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <CustomTextField fullWidth label='Client Key' value={form.midtrans_production_client_key || ''} onChange={e => handleChange('midtrans_production_client_key', e.target.value)} placeholder='Mid-client-...' />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Tripay Settings */}
      {paymentMode === 'tripay' && (
        <Card>
          <CardHeader title='Tripay Settings' avatar={<i className='tabler-key' style={{ fontSize: 24 }} />} />
          <Divider />
          <CardContent>
            <Alert severity='info' sx={{ mb: 3 }}>
              <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 0.5 }}>Callback URL</Typography>
              <Typography variant='body2' sx={{ fontFamily: 'monospace', mb: 1 }}>
                https://playfast.id/callback/tripay
              </Typography>
              <Typography variant='caption'>
                Salin URL ini ke pengaturan callback di dashboard Tripay. Default payment method: <strong>QRIS2</strong> (bisa diubah di bawah, isi pakai kode channel Tripay seperti QRIS2, BRIVA, BNIVA, OVO, GOPAY, dll).
              </Typography>
            </Alert>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={
                    <Radio
                      checked={form.tripay_is_production === 'true'}
                      onChange={() => handleChange('tripay_is_production', 'true')}
                    />
                  }
                  label='Production (real money)'
                />
                <FormControlLabel
                  control={
                    <Radio
                      checked={form.tripay_is_production !== 'true'}
                      onChange={() => handleChange('tripay_is_production', 'false')}
                    />
                  }
                  label='Sandbox (testing)'
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <CustomTextField
                  fullWidth
                  label='Default Payment Method'
                  value={form.tripay_payment_method || ''}
                  onChange={e => handleChange('tripay_payment_method', e.target.value)}
                  placeholder='QRIS2'
                  helperText='Kode channel Tripay yang dipakai saat create transaction. QRIS2 paling fleksibel — bisa dibayar pakai semua aplikasi yang support QRIS.'
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mt: 1 }}>Sandbox Credentials</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomTextField
                  fullWidth
                  label='Merchant Code'
                  value={form.tripay_sandbox_merchant_code || ''}
                  onChange={e => handleChange('tripay_sandbox_merchant_code', e.target.value)}
                  placeholder='T01234'
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomTextField
                  fullWidth
                  label='API Key'
                  value={form.tripay_sandbox_api_key || ''}
                  onChange={e => handleChange('tripay_sandbox_api_key', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomTextField
                  fullWidth
                  label='Private Key'
                  type='password'
                  value={form.tripay_sandbox_private_key || ''}
                  onChange={e => handleChange('tripay_sandbox_private_key', e.target.value)}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Typography variant='subtitle2' sx={{ fontWeight: 700, mt: 1 }}>Production Credentials</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomTextField
                  fullWidth
                  label='Merchant Code'
                  value={form.tripay_production_merchant_code || ''}
                  onChange={e => handleChange('tripay_production_merchant_code', e.target.value)}
                  placeholder='T01234'
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomTextField
                  fullWidth
                  label='API Key'
                  value={form.tripay_production_api_key || ''}
                  onChange={e => handleChange('tripay_production_api_key', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomTextField
                  fullWidth
                  label='Private Key'
                  type='password'
                  value={form.tripay_production_private_key || ''}
                  onChange={e => handleChange('tripay_production_private_key', e.target.value)}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Manual Payment Settings */}
      {paymentMode === 'manual' && (
        <Card>
          <CardHeader title='Manual Payment (QRIS + WhatsApp)' avatar={<i className='tabler-qrcode' style={{ fontSize: 24 }} />} />
          <Divider />
          <CardContent>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                <CustomTextField fullWidth label='QRIS Image URL' value={form.manual_qris_image_url || ''} onChange={e => handleChange('manual_qris_image_url', e.target.value)} placeholder='https://example.com/qris.png' helperText='Direct URL to your QRIS image. Upload to Imgur or similar.' />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <CustomTextField fullWidth label='WhatsApp Number' value={form.manual_whatsapp_number || ''} onChange={e => handleChange('manual_whatsapp_number', e.target.value)} placeholder='6282240708329' helperText='Without + prefix. Used for wa.me link.' />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <CustomTextField fullWidth multiline minRows={3} label='Payment Instructions' value={form.manual_payment_instructions || ''} onChange={e => handleChange('manual_payment_instructions', e.target.value)} placeholder='Scan QRIS di bawah ini, lalu kirim bukti transfer via WhatsApp.' />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Subscription Pricing */}
      <Card>
        <CardHeader
          title='Subscription Pricing'
          avatar={<i className='tabler-crown' style={{ fontSize: 24 }} />}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='Monthly Price (IDR)'
                value={form.sub_price_monthly || ''}
                onChange={e => handleChange('sub_price_monthly', e.target.value)}
                placeholder='50000'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='3-Month Price (IDR)'
                value={form.sub_price_3monthly || ''}
                onChange={e => handleChange('sub_price_3monthly', e.target.value)}
                placeholder='120000'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='6-Month Price (IDR)'
                value={form.sub_price_6monthly || ''}
                onChange={e => handleChange('sub_price_6monthly', e.target.value)}
                placeholder='220000'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='Yearly Price (IDR)'
                value={form.sub_price_yearly || ''}
                onChange={e => handleChange('sub_price_yearly', e.target.value)}
                placeholder='400000'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='Lifetime Price (IDR)'
                value={form.sub_price_lifetime || ''}
                onChange={e => handleChange('sub_price_lifetime', e.target.value)}
                placeholder='250000'
                helperText='Set 0 to disable. Drives the landing-page promo banner.'
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Promo Banner */}
      <Card>
        <CardHeader
          title='Promo Banner'
          avatar={<i className='tabler-megaphone' style={{ fontSize: 24 }} />}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', pl: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.promo_banner_enabled === 'true'}
                      onChange={e => handleChange('promo_banner_enabled', e.target.checked ? 'true' : 'false')}
                    />
                  }
                  label='Banner aktif'
                />
                <Typography variant='caption' color='text.secondary' sx={{ mt: 0.5 }}>
                  Banner hanya tampil bila aktif & berada di rentang tanggal.
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CustomTextField
                select
                fullWidth
                label='Target Plan'
                value={form.promo_banner_target_plan || 'lifetime'}
                onChange={e => handleChange('promo_banner_target_plan', e.target.value)}
                SelectProps={{ native: true }}
                helperText='Plan yang harganya jadi promo_price (ambil dari sub_price_{plan}).'
              >
                <option value='monthly'>monthly</option>
                <option value='3monthly'>3monthly</option>
                <option value='6monthly'>6monthly</option>
                <option value='yearly'>yearly</option>
                <option value='lifetime'>lifetime</option>
              </CustomTextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CustomTextField
                fullWidth
                label='Start Date'
                value={form.promo_banner_start_date || ''}
                onChange={e => handleChange('promo_banner_start_date', e.target.value)}
                placeholder='2026-04-24T00:00:00+07:00'
                helperText='ISO format: 2026-05-16T00:00:00+07:00'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CustomTextField
                fullWidth
                label='End Date'
                value={form.promo_banner_end_date || ''}
                onChange={e => handleChange('promo_banner_end_date', e.target.value)}
                placeholder='2026-05-16T00:00:00+07:00'
                helperText='ISO format: 2026-05-16T00:00:00+07:00'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CustomTextField
                fullWidth
                type='number'
                label='Regular Price (IDR)'
                value={form.promo_banner_regular_price || ''}
                onChange={e => handleChange('promo_banner_regular_price', e.target.value)}
                placeholder='599000'
                helperText='Harga coret yang ditampilkan di banner.'
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <CustomTextField
                fullWidth
                label='Session Key Suffix'
                value={form.promo_banner_session_key_suffix || ''}
                onChange={e => handleChange('promo_banner_session_key_suffix', e.target.value)}
                placeholder='v2'
                helperText='Ganti string ini saat launch promo baru supaya user yang sudah dismiss bisa lihat lagi.'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <CustomTextField
                fullWidth
                label='Eyebrow'
                value={form.promo_banner_eyebrow || ''}
                onChange={e => handleChange('promo_banner_eyebrow', e.target.value)}
                placeholder='PROMO TERBATAS · LIFETIME DEAL'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <CustomTextField
                fullWidth
                multiline
                minRows={3}
                label='Headline'
                value={form.promo_banner_headline || ''}
                onChange={e => handleChange('promo_banner_headline', e.target.value)}
                placeholder={'Subscribe\n*Sekali,* Main\nSelamanya.'}
                helperText={'\\n = baris baru. *text* = teks dengan gradient emas.'}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <CustomTextField
                fullWidth
                multiline
                minRows={2}
                label='Subhead'
                value={form.promo_banner_subhead || ''}
                onChange={e => handleChange('promo_banner_subhead', e.target.value)}
                placeholder='Akses semua 300+ game Steam di katalog kami — satu kali bayar, tanpa biaya bulanan, tanpa batas waktu.'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <CustomTextField
                fullWidth
                label='Features'
                value={form.promo_banner_features || ''}
                onChange={e => handleChange('promo_banner_features', e.target.value)}
                placeholder='Akses 300+ game Steam|100% Original|OTP Otomatis 24/7|Garansi akun selamanya'
                helperText='Pisahkan dengan | (pipe). Maks 4 item.'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <CustomTextField
                fullWidth
                label='CTA Text'
                value={form.promo_banner_cta_text || ''}
                onChange={e => handleChange('promo_banner_cta_text', e.target.value)}
                placeholder='Ambil Promo Sekarang'
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <CustomTextField
                fullWidth
                multiline
                minRows={4}
                label='WhatsApp Message Template'
                value={form.promo_banner_wa_message || ''}
                onChange={e => handleChange('promo_banner_wa_message', e.target.value)}
                helperText='Placeholder: {price} dan {plan_label}.'
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Community */}
      <Card>
        <CardHeader
          title='Community'
          avatar={<i className='tabler-brand-discord' style={{ fontSize: 24 }} />}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <CustomTextField
                fullWidth
                label='Discord Invite URL'
                value={form.discord_invite_url || ''}
                onChange={e => handleChange('discord_invite_url', e.target.value)}
                placeholder='https://discord.gg/xxxxxxx'
                helperText='Visitors going to playfast.id/discord get redirected here. Leave empty to fall back to homepage.'
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Landing Content */}
      <Card>
        <CardHeader
          title='Landing Content'
          avatar={<i className='tabler-video' style={{ fontSize: 24 }} />}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <CustomTextField
                fullWidth
                label='Tutorial YouTube URL'
                value={form.tutorial_youtube_url || ''}
                onChange={e => handleChange('tutorial_youtube_url', e.target.value)}
                placeholder='https://www.youtube.com/watch?v=xxxxxxxxxxx atau https://youtu.be/xxxxxxxxxxx'
                helperText='Video tutorial yang muncul di halaman depan. Kosongkan untuk sembunyikan section-nya.'
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminSettingsPage
