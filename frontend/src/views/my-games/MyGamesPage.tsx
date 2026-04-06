'use client'

import { useRouter } from 'next/navigation'

import { useQuery } from '@tanstack/react-query'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'

import { storeApi } from '@/lib/api'

const MyGamesPage = () => {
  const router = useRouter()

  const { data: orders, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => storeApi.getOrders()
  })

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>
          My Games
        </Typography>
        <Typography color='text.secondary'>
          Your purchased games and access credentials
        </Typography>
      </Box>

      {isLoading ? (
        <Card>
          <CardContent>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={60} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        </Card>
      ) : !orders || orders.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-device-gamepad-2' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              No games yet
            </Typography>
            <Typography color='text.secondary' sx={{ mb: 3 }}>
              Visit the store to get your first game!
            </Typography>
            <Button variant='contained' onClick={() => router.push('/store')}>
              Browse Store
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Game</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align='right'>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map(order => (
                  <TableRow key={order.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box
                          component='img'
                          src={`https://cdn.akamai.steamstatic.com/steam/apps/${order.game_appid}/capsule_sm_120.jpg`}
                          alt={order.game_name}
                          sx={{ width: 48, height: 18, borderRadius: 0.5, objectFit: 'cover' }}
                          onError={(e: any) => { e.target.style.display = 'none' }}
                        />
                        <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
                          {order.game_name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                        {order.account_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>
                        {new Date(order.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size='small'
                        label={order.status || 'Active'}
                        color='success'
                        variant='tonal'
                      />
                    </TableCell>
                    <TableCell align='right'>
                      <Button
                        variant='contained'
                        size='small'
                        startIcon={<i className='tabler-player-play' />}
                        onClick={() => router.push(`/play/${order.id}`)}
                      >
                        Play
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </div>
  )
}

export default MyGamesPage
