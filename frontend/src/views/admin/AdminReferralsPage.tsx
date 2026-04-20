'use client'
import { useQuery } from '@tanstack/react-query'
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
import Alert from '@mui/material/Alert'

import { adminApi, formatIDR } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminReferralsPage = () => {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['admin-referrals'],
    queryFn: () => adminApi.getReferrals(),
    enabled: user?.role === 'admin',
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

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
      </Card>
    </div>
  )
}

export default AdminReferralsPage
