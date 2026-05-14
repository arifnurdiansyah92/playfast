'use client'
import { useEffect, useMemo, useState } from 'react'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import TablePagination from '@mui/material/TablePagination'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'

import { adminApi, formatIDR } from '@/lib/api'
import type { RevenueSharingItem } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

type CommissionMode = 'percentage' | 'flat'
type StatusFilter = 'all' | 'paid' | 'unpaid'

function formatDateID(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function computeCommissionFor(item: RevenueSharingItem, mode: CommissionMode, rate: number): number {
  if (mode === 'percentage') return Math.round((item.amount_paid * rate) / 100)
  return rate
}

const AdminRevenueSharingPage = () => {
  const { user } = useAuth()
  const qc = useQueryClient()

  const [promoCodeId, setPromoCodeId] = useState<number | ''>('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [dateStart, setDateStart] = useState<string>('')
  const [dateEnd, setDateEnd] = useState<string>('')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const [mode, setMode] = useState<CommissionMode>('percentage')
  const [rate, setRate] = useState<number>(20)
  const [flatAmount, setFlatAmount] = useState<number>(25000)

  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [paidNote, setPaidNote] = useState('')
  const [markUnpaidOpen, setMarkUnpaidOpen] = useState(false)

  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null)

  // Reset page + selection on filter changes.
  useEffect(() => { setPage(1); setSelected(new Set()) }, [promoCodeId, status, dateStart, dateEnd, rowsPerPage])

  const { data: promoList, isLoading: loadingPromos } = useQuery({
    queryKey: ['admin-revenue-sharing-promos'],
    queryFn: () => adminApi.getRevenueSharingPromoCodes(),
    enabled: user?.role === 'admin',
  })

  // Auto-select the first promo code once the list loads.
  useEffect(() => {
    if (promoCodeId === '' && promoList?.items && promoList.items.length > 0) {
      setPromoCodeId(promoList.items[0].id)
    }
  }, [promoList, promoCodeId])

  const { data, isFetching } = useQuery({
    queryKey: ['admin-revenue-sharing', { promoCodeId, status, dateStart, dateEnd, page, rowsPerPage }],
    queryFn: () => adminApi.getRevenueSharing({
      promo_code_id: promoCodeId as number,
      status,
      page,
      per_page: rowsPerPage,
      date_start: dateStart || undefined,
      date_end: dateEnd || undefined,
    }),
    enabled: user?.role === 'admin' && promoCodeId !== '',
    placeholderData: keepPreviousData,
  })

  const markPaidMut = useMutation({
    mutationFn: ({ ids, note }: { ids: number[]; note?: string }) =>
      adminApi.markRevenueSharingPaid(ids, note),
    onSuccess: (res) => {
      setSnack({ msg: `${res.updated} usage(s) marked as paid`, sev: 'success' })
      setSelected(new Set())
      setMarkPaidOpen(false)
      setPaidNote('')
      qc.invalidateQueries({ queryKey: ['admin-revenue-sharing'] })
    },
    onError: (e: any) => setSnack({ msg: e?.message || 'Failed to mark paid', sev: 'error' }),
  })

  const markUnpaidMut = useMutation({
    mutationFn: (ids: number[]) => adminApi.markRevenueSharingUnpaid(ids),
    onSuccess: (res) => {
      setSnack({ msg: `${res.updated} usage(s) marked as unpaid`, sev: 'success' })
      setSelected(new Set())
      setMarkUnpaidOpen(false)
      qc.invalidateQueries({ queryKey: ['admin-revenue-sharing'] })
    },
    onError: (e: any) => setSnack({ msg: e?.message || 'Failed to mark unpaid', sev: 'error' }),
  })

  const items = data?.items ?? []
  const stats = data?.stats
  const promoMeta = data?.promo_code

  const effectiveRate = mode === 'percentage' ? rate : flatAmount

  const commissionOwed = useMemo(() => {
    if (!stats) return 0
    if (mode === 'percentage') return Math.round((stats.unpaid_revenue * rate) / 100)
    return stats.unpaid_count * flatAmount
  }, [stats, mode, rate, flatAmount])

  const commissionPaid = useMemo(() => {
    if (!stats) return 0
    if (mode === 'percentage') return Math.round((stats.paid_revenue * rate) / 100)
    return stats.paid_count * flatAmount
  }, [stats, mode, rate, flatAmount])

  const allRowsSelected = items.length > 0 && items.every(i => selected.has(i.id))
  const someRowsSelected = items.some(i => selected.has(i.id))

  const toggleAll = () => {
    if (allRowsSelected) {
      const next = new Set(selected)
      items.forEach(i => next.delete(i.id))
      setSelected(next)
    } else {
      const next = new Set(selected)
      items.forEach(i => next.add(i.id))
      setSelected(next)
    }
  }

  const toggleRow = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const exportPDF = async () => {
    if (!promoMeta || !data) return
    const jsPDFMod = await import('jspdf')
    const autoTableMod = await import('jspdf-autotable')
    const jsPDF = jsPDFMod.default
    const autoTable = autoTableMod.default

    const doc = new jsPDF()
    const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    const code = promoMeta.code

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('PLAYFAST — Revenue Sharing Report', 14, 18)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Promo Code: ${code}`, 14, 26)
    doc.text(`Creator: ${promoMeta.assigned_user_email || '—'}`, 14, 31)
    doc.text(`Report Date: ${today}`, 14, 36)
    const rateLabel = mode === 'percentage' ? `${rate}% of revenue` : `Rp ${flatAmount.toLocaleString('id-ID')} per paying user`
    doc.text(`Commission Rate: ${rateLabel}`, 14, 41)
    const periodLabel = dateStart || dateEnd
      ? `${dateStart || 'all-time'} → ${dateEnd || 'today'}`
      : 'All time (no date filter)'
    doc.text(`Period: ${periodLabel}`, 14, 46)

    if (stats) {
      doc.setFont('helvetica', 'bold')
      doc.text('Summary', 14, 56)
      doc.setFont('helvetica', 'normal')
      doc.text(`Total Revenue: ${formatIDR(stats.total_revenue)}`, 14, 62)
      doc.text(`Total Commission Owed (unpaid): ${formatIDR(commissionOwed)}`, 14, 67)
      doc.text(`Paid Count: ${stats.paid_count}  |  Unpaid Count: ${stats.unpaid_count}`, 14, 72)
    }

    const tableRows = items.map(it => [
      formatDateID(it.used_at),
      it.user_email || '-',
      it.transaction_label || '-',
      formatIDR(it.amount_paid),
      formatIDR(it.discount_amount),
      formatIDR(computeCommissionFor(it, mode, effectiveRate)),
      it.paid_to_creator_at ? 'Paid' : 'Unpaid',
    ])

    autoTable(doc, {
      head: [['Date', 'User', 'Transaction', 'Subtotal', 'Discount', 'Commission', 'Status']],
      body: tableRows,
      startY: 80,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [201, 162, 39] },
    })

    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(
        `Generated ${new Date().toLocaleString('id-ID')}  |  Page ${i} of ${pageCount}`,
        14,
        doc.internal.pageSize.getHeight() - 8,
      )
    }

    const datePart = new Date().toISOString().slice(0, 10)
    const periodPart = dateStart || dateEnd
      ? `-${dateStart || 'all'}_to_${dateEnd || 'today'}`
      : ''
    doc.save(`revenue-sharing-${code}${periodPart}-${datePart}.pdf`)
  }

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4'>Revenue Sharing</Typography>
        <Typography variant='body2' color='text.secondary'>
          {promoMeta
            ? <>Tracking <strong>{promoMeta.code}</strong>{promoMeta.assigned_user_email ? <> — creator <strong>{promoMeta.assigned_user_email}</strong></> : ''}</>
            : 'Pick a promo code below to start tracking commission.'}
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'flex-end' }}>
            <FormControl fullWidth size='small' sx={{ flex: 2 }}>
              <InputLabel id='promo-select-label'>Promo Code</InputLabel>
              <Select
                labelId='promo-select-label'
                label='Promo Code'
                value={promoCodeId === '' ? '' : String(promoCodeId)}
                onChange={e => setPromoCodeId(Number(e.target.value))}
                disabled={loadingPromos}
              >
                {(promoList?.items ?? []).map(p => (
                  <MenuItem key={p.id} value={String(p.id)}>
                    {p.code} — {p.usage_count} usage{p.usage_count === 1 ? '' : 's'}
                    {p.description ? ` · ${p.description}` : ''}
                  </MenuItem>
                ))}
                {(promoList?.items?.length ?? 0) === 0 && !loadingPromos && (
                  <MenuItem value='' disabled>No promo codes with paid usages yet</MenuItem>
                )}
              </Select>
            </FormControl>
            <TextField
              size='small'
              type='date'
              label='Start Date'
              value={dateStart}
              onChange={e => setDateStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              size='small'
              type='date'
              label='End Date'
              value={dateEnd}
              onChange={e => setDateEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1, minWidth: 160 }}
            />
            {(dateStart || dateEnd) && (
              <Button
                size='small'
                variant='text'
                onClick={() => { setDateStart(''); setDateEnd('') }}
                sx={{ alignSelf: { xs: 'flex-end', md: 'center' } }}
              >
                Clear dates
              </Button>
            )}
          </Stack>
          {(dateStart || dateEnd) && (
            <Typography variant='caption' color='text.secondary' sx={{ mt: 1.5, display: 'block' }}>
              Filtering usages with used_at between {dateStart || '—'} and {dateEnd || '—'}. Cocok buat ngecek per cycle (mis. 18 Mei → 5 Juni) atau ngeluarin campaign lama dari kalkulasi.
            </Typography>
          )}
        </CardContent>
      </Card>

      {stats && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card><CardContent>
              <Typography variant='caption' color='text.secondary'>Total Revenue</Typography>
              <Typography variant='h5'>{formatIDR(stats.total_revenue)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card><CardContent>
              <Typography variant='caption' color='text.secondary'>Total Usages</Typography>
              <Typography variant='h5'>{stats.total_count}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card><CardContent>
              <Typography variant='caption' color='text.secondary'>Paid</Typography>
              <Typography variant='h5'>{stats.paid_count}</Typography>
              <Typography variant='caption' color='text.secondary'>{formatIDR(stats.paid_revenue)}</Typography>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card><CardContent>
              <Typography variant='caption' color='text.secondary'>Unpaid</Typography>
              <Typography variant='h5'>{stats.unpaid_count}</Typography>
              <Typography variant='caption' color='text.secondary'>{formatIDR(stats.unpaid_revenue)}</Typography>
            </CardContent></Card>
          </Grid>
        </Grid>
      )}

      <Card elevation={4} sx={{ borderLeft: '4px solid', borderColor: '#c9a227' }}>
        <CardContent>
          <Typography variant='subtitle1' sx={{ mb: 2 }}>Commission Calculator</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems='flex-start'>
            <RadioGroup
              row
              value={mode}
              onChange={e => setMode(e.target.value as CommissionMode)}
            >
              <FormControlLabel value='percentage' control={<Radio />} label='Percentage' />
              <FormControlLabel value='flat' control={<Radio />} label='Flat fee per paying user' />
            </RadioGroup>
            {mode === 'percentage' ? (
              <TextField
                size='small'
                type='number'
                label='% of revenue'
                value={rate}
                onChange={e => setRate(Math.max(0, Number(e.target.value) || 0))}
                sx={{ width: 180 }}
              />
            ) : (
              <TextField
                size='small'
                type='number'
                label='Rp per paying user'
                value={flatAmount}
                onChange={e => setFlatAmount(Math.max(0, Number(e.target.value) || 0))}
                sx={{ width: 220 }}
              />
            )}
          </Stack>

          <Box sx={{ mt: 3 }}>
            <Typography variant='h4' sx={{ color: '#c9a227' }}>
              Total Commission Owed: {formatIDR(commissionOwed)}
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
              Already paid: {formatIDR(commissionPaid)}
            </Typography>
            {stats && (
              <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1 }}>
                {mode === 'percentage'
                  ? `${rate}% × ${formatIDR(stats.unpaid_revenue)} (unpaid revenue) = ${formatIDR(commissionOwed)} owed`
                  : `${formatIDR(flatAmount)} × ${stats.unpaid_count} unpaid users = ${formatIDR(commissionOwed)} owed`}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          label={`All (${stats?.total_count ?? 0})`}
          color={status === 'all' ? 'primary' : 'default'}
          onClick={() => setStatus('all')}
          variant={status === 'all' ? 'filled' : 'outlined'}
        />
        <Chip
          label={`Paid (${stats?.paid_count ?? 0})`}
          color={status === 'paid' ? 'success' : 'default'}
          onClick={() => setStatus('paid')}
          variant={status === 'paid' ? 'filled' : 'outlined'}
        />
        <Chip
          label={`Unpaid (${stats?.unpaid_count ?? 0})`}
          color={status === 'unpaid' ? 'warning' : 'default'}
          onClick={() => setStatus('unpaid')}
          variant={status === 'unpaid' ? 'filled' : 'outlined'}
        />
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant='outlined'
          size='small'
          startIcon={<i className='tabler-file-export' />}
          onClick={exportPDF}
          disabled={!data || items.length === 0}
        >
          Export PDF
        </Button>
      </Box>

      <Card sx={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.15s' }}>
        <TableContainer>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell padding='checkbox'>
                  <Checkbox
                    indeterminate={someRowsSelected && !allRowsSelected}
                    checked={allRowsSelected}
                    onChange={toggleAll}
                    disabled={items.length === 0}
                  />
                </TableCell>
                <TableCell>Date</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Transaction</TableCell>
                <TableCell align='right'>Subtotal</TableCell>
                <TableCell align='right'>Discount</TableCell>
                <TableCell align='right'>Commission</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align='right'>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align='center' sx={{ py: 4, color: 'text.secondary' }}>
                    {promoCodeId === '' ? 'Select a promo code to view usages.' : 'No usages match the current filter.'}
                  </TableCell>
                </TableRow>
              ) : items.map(it => {
                const isPaid = !!it.paid_to_creator_at
                const commission = computeCommissionFor(it, mode, effectiveRate)
                return (
                  <TableRow key={it.id} hover selected={selected.has(it.id)}>
                    <TableCell padding='checkbox'>
                      <Checkbox checked={selected.has(it.id)} onChange={() => toggleRow(it.id)} />
                    </TableCell>
                    <TableCell>{formatDateID(it.used_at)}</TableCell>
                    <TableCell>{it.user_email || '-'}</TableCell>
                    <TableCell>{it.transaction_label || '-'}</TableCell>
                    <TableCell align='right'>{formatIDR(it.subtotal)}</TableCell>
                    <TableCell align='right'>{formatIDR(it.discount_amount)}</TableCell>
                    <TableCell align='right'>{formatIDR(commission)}</TableCell>
                    <TableCell>
                      {isPaid ? (
                        <Tooltip title={it.paid_to_creator_note || `Paid on ${formatDateID(it.paid_to_creator_at)}`}>
                          <Chip size='small' color='success' label={`Paid ${formatDateID(it.paid_to_creator_at).split(',')[0]}`} />
                        </Tooltip>
                      ) : (
                        <Chip size='small' color='warning' label='Unpaid' />
                      )}
                    </TableCell>
                    <TableCell align='right'>
                      {isPaid ? (
                        <Button size='small' onClick={() => markUnpaidMut.mutate([it.id])}>
                          Undo
                        </Button>
                      ) : (
                        <Button
                          size='small'
                          variant='contained'
                          onClick={() => {
                            setSelected(new Set([it.id]))
                            setMarkPaidOpen(true)
                          }}
                        >
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component='div'
          count={data?.total ?? 0}
          page={page - 1}
          onPageChange={(_, p) => setPage(p + 1)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => setRowsPerPage(parseInt(e.target.value, 10))}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Card>

      {selected.size > 0 && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 16,
            zIndex: 5,
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            p: 2,
            bgcolor: 'background.paper',
            borderRadius: 1,
            boxShadow: 4,
          }}
        >
          <Typography variant='body2'>{selected.size} selected</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant='contained' color='success' size='small' onClick={() => setMarkPaidOpen(true)}>
            Mark Selected as Paid
          </Button>
          <Button variant='outlined' color='warning' size='small' onClick={() => setMarkUnpaidOpen(true)}>
            Mark Selected as Unpaid
          </Button>
        </Box>
      )}

      <Dialog open={markPaidOpen} onClose={() => setMarkPaidOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>Mark {selected.size} usage(s) as Paid</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            margin='normal'
            label='Payment note (optional)'
            placeholder='e.g. Transfer BCA 2026-05-05'
            value={paidNote}
            onChange={e => setPaidNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMarkPaidOpen(false)}>Cancel</Button>
          <Button
            variant='contained'
            color='success'
            disabled={markPaidMut.isPending}
            onClick={() => markPaidMut.mutate({ ids: Array.from(selected), note: paidNote.trim() || undefined })}
          >
            Confirm Payment
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={markUnpaidOpen} onClose={() => setMarkUnpaidOpen(false)} maxWidth='xs' fullWidth>
        <DialogTitle>Mark {selected.size} usage(s) as Unpaid?</DialogTitle>
        <DialogContent>
          <Typography variant='body2' color='text.secondary'>
            This will clear the paid-to-creator timestamp and note.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMarkUnpaidOpen(false)}>Cancel</Button>
          <Button
            variant='contained'
            color='warning'
            disabled={markUnpaidMut.isPending}
            onClick={() => markUnpaidMut.mutate(Array.from(selected))}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {snack ? <Alert severity={snack.sev} onClose={() => setSnack(null)}>{snack.msg}</Alert> : undefined}
      </Snackbar>
    </div>
  )
}

export default AdminRevenueSharingPage
