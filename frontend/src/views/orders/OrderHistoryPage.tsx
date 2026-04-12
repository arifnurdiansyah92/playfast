'use client'

import { useState } from 'react'

import Link from 'next/link'

import { useQuery } from '@tanstack/react-query'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Pagination from '@mui/material/Pagination'

import { storeApi, formatIDR } from '@/lib/api'
import type { Order } from '@/lib/api'

const statusConfig: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' | 'info' }> = {
  fulfilled: { label: 'Aktif', color: 'success' },
  pending_payment: { label: 'Menunggu Bayar', color: 'warning' },
  cancelled: { label: 'Dibatalkan', color: 'default' },
  expired: { label: 'Kedaluwarsa', color: 'default' },
  revoked: { label: 'Dicabut', color: 'error' },
}

const tabFilters = [
  { label: 'Semua', value: '' },
  { label: 'Aktif', value: 'fulfilled' },
  { label: 'Menunggu Bayar', value: 'pending_payment' },
  { label: 'Dibatalkan', value: 'cancelled' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const OrderHistoryPage = () => {
  const [tab, setTab] = useState(0)
  const [page, setPage] = useState(1)

  const { data: orders, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => storeApi.getOrders(),
  })

  const filterValue = tabFilters[tab].value
  const filtered = orders
    ? filterValue
      ? orders.filter(o => o.status === filterValue)
      : orders
    : []

  const perPage = 10
  const totalPages = Math.ceil(filtered.length / perPage)
  const paged = filtered.slice((page - 1) * perPage, page * perPage)

  const handleTabChange = (_: unknown, newValue: number) => {
    setTab(newValue)
    setPage(1)
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>Riwayat Pesanan</Typography>
        <Typography color='text.secondary'>
          {orders ? `${orders.length} pesanan` : 'Memuat...'}
        </Typography>
      </Box>

      <Card>
        <Tabs
          value={tab}
          onChange={handleTabChange}
          sx={{ px: 3, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          {tabFilters.map(t => (
            <Tab key={t.value} label={t.label} />
          ))}
        </Tabs>

        {isLoading ? (
          <CardContent>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={60} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        ) : paged.length === 0 ? (
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-receipt-off' style={{ fontSize: 48, opacity: 0.4 }} />
            <Typography variant='h6' sx={{ mt: 2, mb: 1 }}>Belum ada pesanan</Typography>
            <Typography color='text.secondary' sx={{ mb: 3 }}>
              {filterValue ? 'Tidak ada pesanan dengan status ini' : 'Cari game di toko untuk mulai bermain'}
            </Typography>
            {!filterValue && (
              <Button component={Link} href='/store' variant='contained' startIcon={<i className='tabler-building-store' />}>
                Cari Game
              </Button>
            )}
          </CardContent>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Game</TableCell>
                    <TableCell>Tanggal</TableCell>
                    <TableCell>Harga</TableCell>
                    <TableCell>Pembayaran</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align='right'>Aksi</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paged.map((order: Order) => {
                    const st = statusConfig[order.status] ?? { label: order.status, color: 'default' as const }

                    return (
                      <TableRow key={order.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {order.game && (
                              <Box
                                component='img'
                                src={`https://cdn.akamai.steamstatic.com/steam/apps/${order.game.appid}/capsule_sm_120.jpg`}
                                alt={order.game.name}
                                sx={{ width: 64, height: 30, borderRadius: 0.5, objectFit: 'cover' }}
                                onError={(e: any) => { e.target.style.display = 'none' }}
                              />
                            )}
                            <Box>
                              <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
                                {order.game?.name ?? `Game #${order.game_id}`}
                              </Typography>
                              <Typography variant='caption' color='text.secondary'>
                                #{order.id}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant='body2'>{formatDate(order.created_at)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant='body2' sx={{ fontWeight: 600 }}>
                            {order.amount ? formatIDR(order.amount) : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant='body2' sx={{ textTransform: 'capitalize' }}>
                            {order.payment_type ?? '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={st.label} color={st.color} size='small' variant='tonal' />
                        </TableCell>
                        <TableCell align='right'>
                          {order.status === 'fulfilled' && !order.is_revoked ? (
                            <Button
                              component={Link}
                              href={`/play/${order.id}`}
                              size='small'
                              variant='contained'
                              startIcon={<i className='tabler-player-play' />}
                            >
                              Main
                            </Button>
                          ) : order.status === 'pending_payment' ? (
                            <Button
                              component={Link}
                              href={`/order/${order.id}`}
                              size='small'
                              variant='outlined'
                              startIcon={<i className='tabler-credit-card' />}
                            >
                              Bayar
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color='primary' />
              </Box>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

export default OrderHistoryPage
