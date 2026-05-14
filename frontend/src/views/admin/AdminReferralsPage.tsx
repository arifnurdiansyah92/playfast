'use client'
import { useEffect, useState } from 'react'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import TablePagination from '@mui/material/TablePagination'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'

import { adminApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}

const AdminReferralsPage = () => {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, rowsPerPage])

  const { data, isFetching } = useQuery({
    queryKey: ['admin-referrals', { page, rowsPerPage, debouncedSearch }],
    queryFn: () => adminApi.getReferrals({
      page,
      per_page: rowsPerPage,
      q: debouncedSearch.trim() || undefined,
    }),
    enabled: user?.role === 'admin',
    placeholderData: keepPreviousData,
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const total = data?.total ?? 0

  return (
    <div className='flex flex-col gap-6'>
      <Typography variant='h4'>Referrals</Typography>
      <Box sx={{ display: 'flex', gap: 3 }}>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography variant='caption' color='text.secondary'>Total Referrals</Typography>
          <Typography variant='h5'>{data?.total_count ?? 0}</Typography>
        </CardContent></Card>
        <Card sx={{ flex: 1 }}><CardContent>
          <Typography variant='caption' color='text.secondary'>Total Credit Awarded</Typography>
          <Typography variant='h5'>{formatIDR(data?.total_credit_awarded ?? 0)}</Typography>
        </CardContent></Card>
      </Box>

      <Card>
        <CardContent sx={{ pb: '16px !important' }}>
          <TextField
            fullWidth size='small'
            placeholder='Search by referrer or referee email…'
            value={search}
            onChange={e => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position='start'><i className='tabler-search' /></InputAdornment>,
                endAdornment: search ? (
                  <InputAdornment position='end'>
                    <IconButton size='small' onClick={() => setSearch('')}>
                      <i className='tabler-x' />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }
            }}
          />
        </CardContent>
      </Card>

      <Card sx={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.15s' }}>
        <TableContainer>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Referrer</TableCell>
                <TableCell>Referee</TableCell>
                <TableCell>Trigger</TableCell>
                <TableCell align='right'>Credit</TableCell>
                <TableCell>Awarded</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.referrals ?? []).map((r: any) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.referrer_email}</TableCell>
                  <TableCell>{r.referee_email}</TableCell>
                  <TableCell>
                    {r.trigger_order_id ? `Order #${r.trigger_order_id}` : r.trigger_subscription_id ? `Sub #${r.trigger_subscription_id}` : '-'}
                  </TableCell>
                  <TableCell align='right'>{formatIDR(r.credit_awarded)}</TableCell>
                  <TableCell>{new Date(r.awarded_at).toLocaleString('id-ID')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component='div'
          count={total}
          page={page - 1}
          onPageChange={(_, p) => setPage(p + 1)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={e => setRowsPerPage(parseInt(e.target.value, 10))}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Card>
    </div>
  )
}

export default AdminReferralsPage
