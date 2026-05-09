'use client'

import { useEffect, useState } from 'react'

import { keepPreviousData, useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Pagination from '@mui/material/Pagination'
import Button from '@mui/material/Button'

import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const PER_PAGE = 50

/** Debounce a value so we don't fire a request on every keystroke. */
function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}

const AdminAuditPage = () => {
  const { user } = useAuth()

  const [emailQ, setEmailQ] = useState('')
  const [accountQ, setAccountQ] = useState('')
  const [gameQ, setGameQ] = useState('')
  const [page, setPage] = useState(1)

  const debouncedEmail = useDebounced(emailQ)
  const debouncedAccount = useDebounced(accountQ)
  const debouncedGame = useDebounced(gameQ)

  // Reset to page 1 whenever filters change. Without this, an empty result
  // on a deep page (e.g. searching from page 8) would be confusing.
  useEffect(() => {
    setPage(1)
  }, [debouncedEmail, debouncedAccount, debouncedGame])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-audit', debouncedEmail, debouncedAccount, debouncedGame, page],
    queryFn: () => adminApi.getAuditCodes({
      page,
      per_page: PER_PAGE,
      email: debouncedEmail || undefined,
      account: debouncedAccount || undefined,
      game: debouncedGame || undefined,
    }),
    enabled: user?.role === 'admin',
    placeholderData: keepPreviousData,
  })

  if (user?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  const entries = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1
  const hasFilters = !!(emailQ || accountQ || gameQ)

  const formatTs = (iso: string) =>
    new Date(iso).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })

  const clearFilters = () => {
    setEmailQ('')
    setAccountQ('')
    setGameQ('')
    setPage(1)
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>
          Code Request Audit Log
        </Typography>
        <Typography color='text.secondary'>
          Track semua request kode Steam Guard. Cari berdasarkan email user, account, atau game.
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            <TextField
              size='small'
              label='Email user'
              placeholder='mis. riski@'
              value={emailQ}
              onChange={e => setEmailQ(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <i className='tabler-search' style={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: emailQ ? (
                    <InputAdornment position='end'>
                      <IconButton size='small' onClick={() => setEmailQ('')} edge='end'>
                        <i className='tabler-x' style={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
            <TextField
              size='small'
              label='Steam account'
              placeholder='mis. playfast01'
              value={accountQ}
              onChange={e => setAccountQ(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <i className='tabler-user-circle' style={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: accountQ ? (
                    <InputAdornment position='end'>
                      <IconButton size='small' onClick={() => setAccountQ('')} edge='end'>
                        <i className='tabler-x' style={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
            <TextField
              size='small'
              label='Game'
              placeholder='mis. cyberpunk'
              value={gameQ}
              onChange={e => setGameQ(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <i className='tabler-device-gamepad-2' style={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: gameQ ? (
                    <InputAdornment position='end'>
                      <IconButton size='small' onClick={() => setGameQ('')} edge='end'>
                        <i className='tabler-x' style={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography variant='body2' color='text.secondary'>
              {isLoading ? 'Memuat...' : `${total.toLocaleString('id-ID')} entri${hasFilters ? ' cocok' : ''}`}
              {isFetching && !isLoading && ' · memperbarui...'}
            </Typography>
            {hasFilters && (
              <Button
                size='small'
                variant='text'
                onClick={clearFilters}
                startIcon={<i className='tabler-filter-off' />}
              >
                Reset filter
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} height={48} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-file-search' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              {hasFilters ? 'Tidak ada hasil yang cocok' : 'Belum ada audit entry'}
            </Typography>
            <Typography color='text.secondary'>
              {hasFilters ? 'Coba ubah atau kosongkan filter pencarian.' : 'Event request kode akan muncul di sini.'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 80 }}>ID</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Game</TableCell>
                  <TableCell>Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map(entry => (
                  <TableRow key={entry.id} hover>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontWeight: 600 }}>
                        #{entry.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{entry.user_email ?? '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                        {entry.account_name ?? '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{entry.game_name ?? '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ whiteSpace: 'nowrap' }}>
                        {formatTs(entry.created_at)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2.5 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, p) => setPage(p)}
                showFirstButton
                showLastButton
                siblingCount={1}
                size='medium'
              />
            </Box>
          )}
        </Card>
      )}
    </div>
  )
}

export default AdminAuditPage
