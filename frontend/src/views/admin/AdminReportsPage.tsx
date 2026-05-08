'use client'

import { useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

import type { ReportPreset, ReportTransaction } from '@/lib/api'
import { adminApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  fulfilled: 'success',
  active: 'success',
  pending_payment: 'warning',
  expired: 'default',
  cancelled: 'error',
  revoked: 'error',
}

const SummaryCard = ({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) => (
  <Card sx={emphasis ? { bgcolor: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)' } : undefined}>
    <CardContent>
      <Typography variant='caption' sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography variant='h5' sx={{ fontWeight: 700, mt: 0.5, color: emphasis ? '#c9a84c' : undefined }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
)

const AdminReportsPage = () => {
  const { user } = useAuth()
  const [preset, setPreset] = useState<ReportPreset>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const queryParams = useMemo<{ preset: ReportPreset; from?: string; to?: string } | null>(() => {
    if (preset === 'custom') {
      if (!customFrom || !customTo) return null
      return { preset: 'custom', from: customFrom, to: customTo }
    }
    return { preset }
  }, [preset, customFrom, customTo])

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-report', queryParams],
    queryFn: () => (queryParams ? adminApi.getReport(queryParams) : Promise.resolve(null)),
    enabled: user?.role === 'admin' && !!queryParams,
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const summary = data?.summary
  const transactions = data?.transactions ?? []
  const dateLabel = data?.date_range.label ?? ''

  const exportHref = queryParams ? adminApi.reportCsvUrl(queryParams) : null

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Laporan Transaksi</Typography>
        <Typography color='text.secondary'>
          Daftar pembelian game + langganan yang sudah dibayar dalam rentang waktu terpilih.
        </Typography>
      </Box>

      {/* Filters */}
      <Card>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToggleButtonGroup
            value={preset}
            exclusive
            onChange={(_, val: ReportPreset | null) => val && setPreset(val)}
            size='small'
          >
            <ToggleButton value='today'>Hari ini</ToggleButton>
            <ToggleButton value='7d'>7 hari terakhir</ToggleButton>
            <ToggleButton value='30d'>30 hari terakhir</ToggleButton>
            <ToggleButton value='custom'>Custom</ToggleButton>
          </ToggleButtonGroup>

          {preset === 'custom' && (
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                type='date'
                label='Dari'
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                size='small'
                InputLabelProps={{ shrink: true }}
              />
              <Typography color='text.secondary'>—</Typography>
              <TextField
                type='date'
                label='Sampai'
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                size='small'
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          )}

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant='contained'
            color='primary'
            component='a'
            href={exportHref ?? '#'}
            download
            disabled={!exportHref || transactions.length === 0}
            startIcon={<i className='tabler-file-spreadsheet' />}
          >
            Export ke Excel
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert severity='error'>Gagal memuat data: {(error as any)?.message || 'Unknown error'}</Alert>
      )}

      {preset === 'custom' && (!customFrom || !customTo) && (
        <Alert severity='info'>Pilih tanggal "Dari" dan "Sampai" untuk filter custom.</Alert>
      )}

      {/* Summary cards */}
      {isLoading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 2 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent><Skeleton height={70} /></CardContent></Card>
          ))}
        </Box>
      ) : summary ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 2 }}>
          <SummaryCard label='Total Pemasukkan' value={formatIDR(summary.total_revenue)} emphasis />
          <SummaryCard
            label='Total Transaksi'
            value={`${summary.total_transactions} (${summary.order_count} game · ${summary.subscription_count} sub)`}
          />
          <SummaryCard label='Pendapatan Game' value={formatIDR(summary.order_revenue)} />
          <SummaryCard label='Pendapatan Subscription' value={formatIDR(summary.subscription_revenue)} />
          <SummaryCard
            label='Total Diskon Promo'
            value={`${formatIDR(summary.total_promo_discount)}${summary.transactions_with_promo ? ` · ${summary.transactions_with_promo}×` : ''}`}
          />
        </Box>
      ) : null}

      {/* Transactions table */}
      <Card>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant='h6' sx={{ fontWeight: 700 }}>
            Daftar Transaksi {dateLabel && `— ${dateLabel}`}
          </Typography>
        </CardContent>
        {isLoading ? (
          <CardContent>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={48} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        ) : transactions.length === 0 ? (
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <i className='tabler-inbox' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='body1' sx={{ mt: 2 }} color='text.secondary'>
              Tidak ada transaksi pada rentang waktu terpilih.
            </Typography>
          </CardContent>
        ) : (
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Tanggal Bayar</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Tipe</TableCell>
                  <TableCell>Detail</TableCell>
                  <TableCell align='right'>Subtotal</TableCell>
                  <TableCell>Promo</TableCell>
                  <TableCell align='right'>Diskon</TableCell>
                  <TableCell align='right'>Total Bayar</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((t: ReportTransaction) => (
                  <TableRow key={t.id} hover>
                    <TableCell>
                      <Typography variant='caption' sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {t.id}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant='caption'>{formatDateTime(t.paid_at)}</Typography>
                    </TableCell>
                    <TableCell>{t.user_email || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={t.type === 'order' ? 'Game' : 'Subscription'}
                        color={t.type === 'order' ? 'primary' : 'warning'}
                        variant='tonal'
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.detail}
                    </TableCell>
                    <TableCell align='right'>{formatIDR(t.amount_subtotal)}</TableCell>
                    <TableCell>
                      {t.promo_code ? (
                        <Chip
                          size='small'
                          icon={<i className='tabler-discount' style={{ fontSize: 12 }} />}
                          label={t.promo_code}
                          variant='outlined'
                          color='info'
                        />
                      ) : (
                        <Typography variant='caption' color='text.disabled'>—</Typography>
                      )}
                    </TableCell>
                    <TableCell align='right' sx={{ color: t.promo_discount > 0 ? 'error.main' : 'text.disabled' }}>
                      {t.promo_discount > 0 ? `-${formatIDR(t.promo_discount)}` : '—'}
                    </TableCell>
                    <TableCell align='right' sx={{ fontWeight: 700 }}>
                      {formatIDR(t.amount)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={t.status}
                        color={STATUS_COLORS[t.status] ?? 'default'}
                        variant='tonal'
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </div>
  )
}

export default AdminReportsPage
