'use client'

import { Fragment, useEffect, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

import type { RefillPriorityItem, RefillReason } from '@/lib/api'
import { adminApi, gameThumbnail, handleImageError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const REASON_LABELS: Record<RefillReason, string> = {
  no_assignment: 'No assignment',
  revoked: 'Revoked',
  account_disabled: 'Disabled acct',
}

const REASON_COLORS: Record<RefillReason, 'error' | 'warning' | 'info'> = {
  no_assignment: 'error',
  revoked: 'warning',
  account_disabled: 'info',
}

function formatRelativeId(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.round((now - then) / 1000))

  if (diffSec < 60) return `${diffSec} detik lalu`
  const diffMin = Math.round(diffSec / 60)

  if (diffMin < 60) return `${diffMin} menit lalu`
  const diffHr = Math.round(diffMin / 60)

  if (diffHr < 24) return `${diffHr} jam lalu`
  const diffDay = Math.round(diffHr / 24)

  if (diffDay < 30) return `${diffDay} hari lalu`
  const diffMo = Math.round(diffDay / 30)

  if (diffMo < 12) return `${diffMo} bulan lalu`
  const diffYr = Math.round(diffMo / 12)

  return `${diffYr} tahun lalu`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'

  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}

const StatCard = ({ label, value, color }: { label: string; value: number | string; color?: string }) => (
  <Card sx={{ flex: 1, minWidth: 180 }}>
    <CardContent>
      <Typography variant='caption' color='text.secondary' sx={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant='h4' sx={{ fontWeight: 700, mt: 0.5, color: color || 'text.primary' }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
)

const AdminRefillPriorityPage = () => {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-refill-priority', debouncedSearch],
    queryFn: () => adminApi.getRefillPriority({ q: debouncedSearch.trim() || undefined }),
    enabled: user?.role === 'admin',
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const items: RefillPriorityItem[] = data?.items ?? []
  const totalGames = data?.total_games ?? 0
  const totalAffectedUsers = data?.total_affected_users ?? 0
  const totalAffectedOrders = data?.total_affected_orders ?? 0

  const toggleExpand = (gameId: number) => {
    setExpanded(prev => {
      const next = new Set(prev)

      if (next.has(gameId)) next.delete(gameId)
      else next.add(gameId)

      return next
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ fontWeight: 700, mb: 0.5 }}>Refill Priority</Typography>
        <Typography color='text.secondary' sx={{ maxWidth: 820 }}>
          Game dengan user yang gak bisa main karena akun Steam-nya unassigned/revoked/disabled.
          Urut berdasarkan jumlah user terdampak — pakai ini untuk prioritas beli akun baru.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <StatCard label='Games with gap' value={totalGames} color={totalGames > 0 ? 'error.main' : undefined} />
        <StatCard label='Affected Users' value={totalAffectedUsers} />
        <StatCard label='Affected Orders' value={totalAffectedOrders} />
      </Box>

      <TextField
        size='small'
        fullWidth
        placeholder='Cari game...'
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position='start'>
              <i className='tabler-search' />
            </InputAdornment>
          ),
        }}
        sx={{ maxWidth: 480 }}
      />

      {totalGames > 100 && (
        <Alert severity='info'>
          Menampilkan {totalGames} game — list panjang, pakai search untuk mempersempit.
        </Alert>
      )}

      {error ? (
        <Alert severity='error'>{(error as Error).message || 'Gagal memuat data'}</Alert>
      ) : isLoading ? (
        <Card>
          <CardContent>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={64} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-mood-happy' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              Tidak ada game dengan masalah refill saat ini.
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
              Semua fulfilled orders punya assignment aktif. 🎉
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 48 }}>#</TableCell>
                  <TableCell>Game</TableCell>
                  <TableCell align='right'>Affected Users</TableCell>
                  <TableCell align='right'>Affected Orders</TableCell>
                  <TableCell>Breakdown</TableCell>
                  <TableCell>Inventory</TableCell>
                  <TableCell>Oldest Issue</TableCell>
                  <TableCell align='right' sx={{ width: 56 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, idx) => {
                  const isOpen = expanded.has(item.game_id)
                  const inventoryEmpty = item.available_account_count === 0

                  return (
                    <Fragment key={item.game_id}>
                      <TableRow hover sx={{ '& td': { borderBottom: isOpen ? 'none' : undefined } }}>
                        <TableCell>
                          <Typography
                            variant='subtitle2'
                            sx={{ fontWeight: 700, color: idx < 3 ? 'error.main' : 'text.secondary' }}
                          >
                            {idx + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box
                              component='img'
                              src={gameThumbnail(item.appid)}
                              alt={item.name}
                              sx={{ width: 64, height: 30, borderRadius: 0.5, objectFit: 'cover', flexShrink: 0 }}
                              onError={handleImageError}
                            />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant='subtitle2' sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                                {item.name}
                              </Typography>
                              <Typography variant='caption' color='text.secondary'>
                                appid {item.appid}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align='right'>
                          <Typography variant='h6' sx={{ fontWeight: 700, color: 'error.main' }}>
                            {item.affected_user_count}
                          </Typography>
                        </TableCell>
                        <TableCell align='right'>
                          <Typography variant='body2' sx={{ fontWeight: 600 }}>
                            {item.affected_order_count}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {(['no_assignment', 'revoked', 'account_disabled'] as RefillReason[]).map(reason => {
                              const count = item.breakdown[reason]

                              if (!count) return null

                              return (
                                <Chip
                                  key={reason}
                                  size='small'
                                  label={`${REASON_LABELS[reason]}: ${count}`}
                                  color={REASON_COLORS[reason]}
                                  variant='tonal'
                                  sx={{ fontSize: '0.7rem', height: 22 }}
                                />
                              )
                            })}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant='body2'
                            sx={{
                              fontWeight: 600,
                              color: inventoryEmpty ? 'error.main' : 'text.primary',
                              fontFamily: 'monospace',
                            }}
                          >
                            {item.available_account_count} / {item.total_account_count} active
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant='caption' color='text.secondary' sx={{ whiteSpace: 'nowrap' }}>
                            {formatRelativeId(item.oldest_affected_at)}
                          </Typography>
                        </TableCell>
                        <TableCell align='right'>
                          <IconButton size='small' onClick={() => toggleExpand(item.game_id)} aria-label='expand'>
                            <i className={isOpen ? 'tabler-chevron-up' : 'tabler-chevron-down'} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={8} sx={{ p: 0, borderBottom: isOpen ? undefined : 'none' }}>
                          <Collapse in={isOpen} timeout='auto' unmountOnExit>
                            <Box sx={{ px: 3, py: 2, bgcolor: 'action.hover' }}>
                              <Typography variant='subtitle2' sx={{ fontWeight: 700, mb: 1 }}>
                                Affected users ({item.affected_users.length})
                              </Typography>
                              <Table size='small'>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Email</TableCell>
                                    <TableCell>Order #</TableCell>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Reason</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {item.affected_users.map(u => (
                                    <TableRow key={u.order_id}>
                                      <TableCell>
                                        <Typography variant='body2'>{u.email || `User #${u.user_id}`}</Typography>
                                      </TableCell>
                                      <TableCell>
                                        <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                                          #{u.order_id}
                                        </Typography>
                                      </TableCell>
                                      <TableCell>
                                        <Typography variant='caption' color='text.secondary'>
                                          {formatDate(u.order_created_at)}
                                        </Typography>
                                      </TableCell>
                                      <TableCell>
                                        <Chip
                                          size='small'
                                          label={REASON_LABELS[u.reason]}
                                          color={REASON_COLORS[u.reason]}
                                          variant='tonal'
                                          sx={{ fontSize: '0.7rem', height: 20 }}
                                        />
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </div>
  )
}

export default AdminRefillPriorityPage
