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
              label={paymentMode === 'manual' ? 'Manual' : paymentMode === 'midtrans_production' ? 'Production' : 'Sandbox'}
              color={paymentMode === 'midtrans_production' ? 'success' : paymentMode === 'manual' ? 'warning' : 'info'}
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

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg('')} message={snackMsg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </div>
  )
}

export default AdminSettingsPage
