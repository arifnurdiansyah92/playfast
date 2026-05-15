'use client'

import { useMemo, useState } from 'react'

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TablePagination from '@mui/material/TablePagination'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'

import { adminApi } from '@/lib/api'
import type { EmailLogStatus, EmailLogType } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import EmailLogDetailDialog from './EmailLogDetailDialog'

const STATUS_COLOR: Record<EmailLogStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  queued: 'default',
  sent: 'info',
  failed: 'error',
  delivered: 'success',
  bounced: 'error',
  soft_bounced: 'warning',
  spam: 'error',
  blocked: 'error',
  invalid_email: 'error',
  deferred: 'warning',
}

const TYPE_OPTIONS: { value: EmailLogType; label: string }[] = [
  { value: 'verification', label: 'Verifikasi Email' },
  { value: 'password_reset', label: 'Reset Password' },
  { value: 'order_welcome', label: 'Order Welcome' },
  { value: 'subscription_welcome', label: 'Subscription Welcome' },
  { value: 'game_request_fulfilled', label: 'Game Request Fulfilled' },
  { value: 'account_flag', label: 'Account Flag' },
]

const formatTs = (s: string | null) => (s ? new Date(s).toLocaleString('id-ID') : '—')

export default function AdminEmailLogsPage() {
  const { user } = useAuth()
  const [recipient, setRecipient] = useState('')
  const [typeFilter, setTypeFilter] = useState<EmailLogType | ''>('')
  const [failedOnly, setFailedOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(50)
  const [openId, setOpenId] = useState<number | null>(null)

  const filters = useMemo(() => ({
    recipient: recipient || undefined,
    type: typeFilter ? [typeFilter] : undefined,
    failed_only: failedOnly || undefined,
    page: page + 1,
    per_page: perPage,
  }), [recipient, typeFilter, failedOnly, page, perPage])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-email-logs', filters],
    queryFn: () => adminApi.listEmailLogs(filters),
    enabled: user?.role === 'admin',
    placeholderData: keepPreviousData,
  })

  if (user?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  return (
    <div className='flex flex-col gap-4'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700 }}>Email Logs</Typography>
        <Typography variant='body2' color='text.secondary'>
          Lacak status kirim setiap email transactional. Klik row untuk detail dan tombol kirim ulang.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size='small'
              label='Recipient'
              placeholder='email atau substring'
              value={recipient}
              onChange={e => { setRecipient(e.target.value); setPage(0) }}
              sx={{ minWidth: 240 }}
              InputProps={{
                endAdornment: recipient && (
                  <InputAdornment position='end'>
                    <IconButton size='small' onClick={() => setRecipient('')}><i className='tabler-x' /></IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              size='small'
              select
              label='Type'
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value as EmailLogType | ''); setPage(0) }}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value=''>Semua</MenuItem>
              {TYPE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <FormControlLabel
              control={<Switch checked={failedOnly} onChange={e => { setFailedOnly(e.target.checked); setPage(0) }} />}
              label='Hanya gagal/bounce'
            />
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 0 }}>
          {isError && <Alert severity='error' sx={{ m: 2 }}>{(error as any)?.message || 'Gagal memuat'}</Alert>}
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Recipient</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Error</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={5}><Skeleton variant='text' /></TableCell>
                  </TableRow>
                ))}
                {data?.logs.map(log => (
                  <TableRow
                    key={log.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setOpenId(log.id)}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTs(log.created_at)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{log.recipient_email}</TableCell>
                    <TableCell>{log.type}</TableCell>
                    <TableCell>
                      <Chip size='small' label={log.status} color={STATUS_COLOR[log.status]} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.error_message || ''}
                    </TableCell>
                  </TableRow>
                ))}
                {data && data.logs.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} align='center' sx={{ py: 4, color: 'text.secondary' }}>
                      Tidak ada log yang cocok dengan filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component='div'
            count={data?.total || 0}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={perPage}
            onRowsPerPageChange={e => { setPerPage(parseInt(e.target.value, 10)); setPage(0) }}
            rowsPerPageOptions={[25, 50, 100, 200]}
          />
        </CardContent>
      </Card>

      <EmailLogDetailDialog
        logId={openId}
        open={openId != null}
        onClose={() => setOpenId(null)}
      />
    </div>
  )
}
