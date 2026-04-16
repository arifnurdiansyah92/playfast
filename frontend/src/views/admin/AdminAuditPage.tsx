'use client'

import { useQuery } from '@tanstack/react-query'

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

import { adminApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const AdminAuditPage = () => {
  const { user } = useAuth()

  const { data: entries, isLoading } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => adminApi.getAuditCodes(),
    enabled: user?.role === 'admin'
  })

  if (user?.role !== 'admin') {
    return <Alert severity='error'>Access denied</Alert>
  }

  return (
    <div className='flex flex-col gap-6'>
      <Box>
        <Typography variant='h4' sx={{ mb: 1 }}>
          Code Request Audit Log
        </Typography>
        <Typography color='text.secondary'>
          Track all Steam Guard code requests
        </Typography>
      </Box>

      {isLoading ? (
        <Card>
          <CardContent>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={60} sx={{ mb: 1 }} />
            ))}
          </CardContent>
        </Card>
      ) : !entries || entries.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <i className='tabler-file-search' style={{ fontSize: 48, opacity: 0.5 }} />
            <Typography variant='h6' sx={{ mt: 2 }}>
              No audit entries
            </Typography>
            <Typography color='text.secondary'>
              Code request events will appear here
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
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
                      <Typography variant='body2'>
                        {entry.user_email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                        {entry.account_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>
                        {entry.game_name ?? '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {new Date(entry.created_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
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

export default AdminAuditPage
