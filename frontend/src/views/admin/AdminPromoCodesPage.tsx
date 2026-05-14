'use client'
import { useEffect, useState } from 'react'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableContainer from '@mui/material/TableContainer'
import TablePagination from '@mui/material/TablePagination'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Switch from '@mui/material/Switch'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Tooltip from '@mui/material/Tooltip'
import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'

import { adminApi, formatIDR } from '@/lib/api'
import type { PromoCode } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

function buildShareLink(code: string, scope: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const encodedCode = encodeURIComponent(code)

  if (scope === 'subscriptions') return `${origin}/subscribe?code=${encodedCode}`

  if (scope.startsWith('sub:')) {
    const plan = scope.split(':', 2)[1]

    
return `${origin}/subscribe?code=${encodedCode}&plan=${encodeURIComponent(plan)}`
  }

  if (scope === 'games' || scope === 'all') return `${origin}/store?code=${encodedCode}`

  if (scope.startsWith('game:')) {
    return `${origin}/store?code=${encodedCode}`
  }

  
return `${origin}/store?code=${encodedCode}`
}

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}

const AdminPromoCodesPage = () => {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [usagesOpen, setUsagesOpen] = useState<number | null>(null)
  const [editingOwnerId, setEditingOwnerId] = useState<number | null>(null)
  const [snack, setSnack] = useState('')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, rowsPerPage])

  const [newCode, setNewCode] = useState<{
    code: string
    description: string
    discount_type: 'percentage' | 'fixed'
    discount_value: number
    scope: string
    min_order_amount: number
    max_uses_total: number | null
    max_uses_per_user: number
    is_active: boolean
    assigned_user_id: number | null
  }>({
    code: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 10,
    scope: 'all',
    min_order_amount: 0,
    max_uses_total: null,
    max_uses_per_user: 1,
    is_active: true,
    assigned_user_id: null,
  })

  const { data: users } = useQuery({
    queryKey: ['admin-users-light'],
    queryFn: () => adminApi.getUsers(),
    enabled: user?.role === 'admin',
  })

  const { data, isFetching } = useQuery({
    queryKey: ['admin-promo-codes', { page, rowsPerPage, debouncedSearch }],
    queryFn: () => adminApi.getPromoCodes({
      page,
      per_page: rowsPerPage,
      q: debouncedSearch.trim() || undefined,
    }),
    enabled: user?.role === 'admin',
    placeholderData: keepPreviousData,
  })

  const createMut = useMutation({
    mutationFn: (d: any) => adminApi.createPromoCode(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promo-codes'] })
      setCreateOpen(false)
      setSnack('Promo code created')
      setNewCode({ ...newCode, code: '', description: '' })
    },
    onError: (e: any) => setSnack(`Error: ${e.message}`),
  })

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      adminApi.updatePromoCode(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-promo-codes'] }),
  })

  const updateOwnerMut = useMutation({
    mutationFn: ({ id, assigned_user_id }: { id: number; assigned_user_id: number | null }) =>
      adminApi.updatePromoCode(id, { assigned_user_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promo-codes'] })
      setEditingOwnerId(null)
      setSnack('Owner updated')
    },
    onError: (e: any) => setSnack(`Error: ${e.message}`),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deletePromoCode(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promo-codes'] })
      setSnack('Deleted')
    },
    onError: (e: any) => setSnack(`Error: ${e.message}`),
  })

  const { data: usagesData } = useQuery({
    queryKey: ['promo-usages', usagesOpen],
    queryFn: () => adminApi.getPromoCodeUsages(usagesOpen!),
    enabled: usagesOpen !== null,
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const codes = data?.promo_codes ?? []
  const total = data?.total ?? 0

  const formatValue = (c: PromoCode) =>
    c.discount_type === 'percentage' ? `${c.discount_value}%` : formatIDR(c.discount_value)

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant='h4'>Promo Codes</Typography>
        <Button variant='contained' onClick={() => setCreateOpen(true)}>Create Promo</Button>
      </Box>

      <Card>
        <CardContent sx={{ pb: '16px !important' }}>
          <TextField
            fullWidth size='small'
            placeholder='Search by code…'
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
                <TableCell>Code</TableCell>
                <TableCell>Discount</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Owner (tracker)</TableCell>
                <TableCell align='center'>Uses</TableCell>
                <TableCell align='center'>Active</TableCell>
                <TableCell align='right'>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {codes.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.code}</Typography>
                    {c.description && (
                      <Typography variant='caption' color='text.secondary'>{c.description}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatValue(c)}</TableCell>
                  <TableCell>{c.scope}</TableCell>
                  <TableCell>
                    {editingOwnerId === c.id ? (
                      <Autocomplete
                        size='small'
                        autoFocus
                        openOnFocus
                        options={users ?? []}
                        getOptionLabel={u => u.email}
                        value={users?.find(u => u.id === c.assigned_user_id) ?? null}
                        onChange={(_, picked) => {
                          updateOwnerMut.mutate({ id: c.id, assigned_user_id: picked?.id ?? null })
                        }}
                        onClose={(_, reason) => {
                          if (reason === 'escape' || reason === 'blur') setEditingOwnerId(null)
                        }}
                        renderInput={(params) => <TextField {...params} placeholder='Cari user…' autoFocus />}
                        sx={{ minWidth: 240 }}
                        isOptionEqualToValue={(o, v) => o.id === v.id}
                        disabled={updateOwnerMut.isPending}
                      />
                    ) : c.assigned_user_email ? (
                      <Chip
                        size='small'
                        color='info'
                        variant='tonal'
                        icon={<i className='tabler-target' style={{ fontSize: 12 }} />}
                        label={c.assigned_user_email}
                        onClick={() => setEditingOwnerId(c.id)}
                        onDelete={() => updateOwnerMut.mutate({ id: c.id, assigned_user_id: null })}
                        sx={{ maxWidth: 200, cursor: 'pointer', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                      />
                    ) : (
                      <Button
                        size='small'
                        variant='text'
                        onClick={() => setEditingOwnerId(c.id)}
                        sx={{ textTransform: 'none', p: 0, minWidth: 0, fontWeight: 400 }}
                      >
                        + Set owner
                      </Button>
                    )}
                  </TableCell>
                  <TableCell align='center'>
                    {c.uses_count ?? 0}{c.max_uses_total ? `/${c.max_uses_total}` : ''}
                  </TableCell>
                  <TableCell align='center'>
                    <Switch
                      checked={c.is_active}
                      onChange={() => toggleActiveMut.mutate({ id: c.id, is_active: !c.is_active })}
                    />
                  </TableCell>
                  <TableCell align='right'>
                    <Button size='small' onClick={() => setUsagesOpen(c.id)}>Usages</Button>
                    <Tooltip title='Copy share link'>
                      <IconButton size='small' onClick={() => {
                        const link = buildShareLink(c.code, c.scope)

                        navigator.clipboard.writeText(link)
                        setSnack(`Link disalin: ${link}`)
                      }}>
                        <i className='tabler-link' />
                      </IconButton>
                    </Tooltip>
                    <IconButton color='error' size='small' onClick={() => {
                      if (confirm(`Delete ${c.code}?`)) deleteMut.mutate(c.id)
                    }}>
                      <i className='tabler-trash' />
                    </IconButton>
                  </TableCell>
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

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>Create Promo Code</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label='Code' value={newCode.code} onChange={e => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })} fullWidth />
            <TextField label='Description' value={newCode.description} onChange={e => setNewCode({ ...newCode, description: e.target.value })} fullWidth />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Discount Type</InputLabel>
                <Select
                  value={newCode.discount_type}
                  label='Discount Type'
                  onChange={e => setNewCode({ ...newCode, discount_type: e.target.value as 'percentage' | 'fixed' })}
                >
                  <MenuItem value='percentage'>Percentage (%)</MenuItem>
                  <MenuItem value='fixed'>Fixed (IDR)</MenuItem>
                </Select>
              </FormControl>
              <TextField label='Value' type='number' value={newCode.discount_value} onChange={e => setNewCode({ ...newCode, discount_value: +e.target.value })} fullWidth />
            </Box>
            <FormControl fullWidth>
              <InputLabel>Scope</InputLabel>
              <Select value={newCode.scope} label='Scope' onChange={e => setNewCode({ ...newCode, scope: e.target.value })}>
                <MenuItem value='all'>All items</MenuItem>
                <MenuItem value='games'>Games only</MenuItem>
                <MenuItem value='subscriptions'>Subscriptions only</MenuItem>
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label='Min Order (IDR)' type='number' value={newCode.min_order_amount} onChange={e => setNewCode({ ...newCode, min_order_amount: +e.target.value })} fullWidth />
              <TextField label='Max Uses Total' type='number' value={newCode.max_uses_total ?? ''} onChange={e => setNewCode({ ...newCode, max_uses_total: e.target.value ? +e.target.value : null })} fullWidth helperText='Empty = unlimited' />
              <TextField label='Max Per User' type='number' value={newCode.max_uses_per_user} onChange={e => setNewCode({ ...newCode, max_uses_per_user: +e.target.value })} fullWidth />
            </Box>

            <Autocomplete
              options={users ?? []}
              getOptionLabel={(u) => u.email}
              value={users?.find(u => u.id === newCode.assigned_user_id) ?? null}
              onChange={(_, picked) => setNewCode({ ...newCode, assigned_user_id: picked ? picked.id : null })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label='Owner — untuk tracking (opsional)'
                  helperText='Pilih user (misal marketer/affiliate) yang "memiliki" kode ini. Kode tetap public — siapapun bisa pakai. Owner cuma dapat akses ke statistik redemption di Promo Tracker mereka.'
                />
              )}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              fullWidth
              clearOnBlur
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant='contained' onClick={() => createMut.mutate(newCode)} disabled={createMut.isPending}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={usagesOpen !== null} onClose={() => setUsagesOpen(null)} maxWidth='md' fullWidth>
        <DialogTitle>
          Usages
          {usagesData && <Typography variant='body2' color='text.secondary'>Total discount given: {formatIDR(usagesData.total_discount)}</Typography>}
        </DialogTitle>
        <DialogContent dividers>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Order/Sub</TableCell>
                <TableCell align='right'>Discount</TableCell>
                <TableCell>When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(usagesData?.usages ?? []).map(u => (
                <TableRow key={u.id}>
                  <TableCell>{u.user_email ?? '-'}</TableCell>
                  <TableCell>
                    {u.order_id ? `Order #${u.order_id}` : u.subscription_id ? `Sub #${u.subscription_id}` : '-'}
                  </TableCell>
                  <TableCell align='right'>{formatIDR(u.discount_amount)}</TableCell>
                  <TableCell>{new Date(u.used_at).toLocaleString('id-ID')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUsagesOpen(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </div>
  )
}

export default AdminPromoCodesPage
