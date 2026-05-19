'use client'
import { useEffect, useMemo, useState } from 'react'

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
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import LinearProgress from '@mui/material/LinearProgress'

import { adminApi } from '@/lib/api'
import type { RedeemCampaign } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

const SUBSCRIPTION_PLANS: { value: string; label: string }[] = [
  { value: 'monthly', label: 'Monthly (30 hari)' },
  { value: '3monthly', label: '3 Months (90 hari)' },
  { value: '6monthly', label: '6 Months (180 hari)' },
  { value: 'yearly', label: 'Yearly (365 hari)' },
  { value: 'lifetime', label: 'Lifetime' },
]

function buildShareLink(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return `${origin}/redeem?code=${encodeURIComponent(code)}`
}

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)

    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}

type NewCampaign = {
  name: string
  description: string
  reward_type: 'subscription' | 'game'
  reward_subscription_plan: string
  reward_subscription_duration_days: number | null
  reward_game_id: number | null
  max_redemptions_per_user: number
  starts_at: string
  expires_at: string
  is_active: boolean
}

const defaultNew: NewCampaign = {
  name: '',
  description: '',
  reward_type: 'subscription',
  reward_subscription_plan: 'monthly',
  reward_subscription_duration_days: null,
  reward_game_id: null,
  max_redemptions_per_user: 1,
  starts_at: '',
  expires_at: '',
  is_active: true,
}

const AdminRedeemPage = () => {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [generateFor, setGenerateFor] = useState<RedeemCampaign | null>(null)
  const [codesFor, setCodesFor] = useState<RedeemCampaign | null>(null)
  const [snack, setSnack] = useState('')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, rowsPerPage])

  const [newCampaign, setNewCampaign] = useState<NewCampaign>(defaultNew)
  const [genCount, setGenCount] = useState<number>(100)
  const [recentBatch, setRecentBatch] = useState<string[]>([])

  // ── Data ──
  const { data: games } = useQuery({
    queryKey: ['admin-games-light'],
    queryFn: () => adminApi.getGames({ per_page: 500 }),
    enabled: user?.role === 'admin' && createOpen,
  })

  const { data, isFetching } = useQuery({
    queryKey: ['admin-redeem-campaigns', { page, rowsPerPage, debouncedSearch }],
    queryFn: () => adminApi.getRedeemCampaigns({
      page,
      per_page: rowsPerPage,
      q: debouncedSearch.trim() || undefined,
    }),
    enabled: user?.role === 'admin',
    placeholderData: keepPreviousData,
  })

  const [codeStatus, setCodeStatus] = useState<'all' | 'redeemed' | 'unredeemed'>('all')
  const [codePage, setCodePage] = useState(1)
  const [codeRowsPerPage, setCodeRowsPerPage] = useState(50)

  useEffect(() => {
    setCodePage(1)
  }, [codeStatus, codesFor?.id])

  const { data: codesData, isFetching: codesFetching } = useQuery({
    queryKey: ['admin-redeem-codes', codesFor?.id, codeStatus, codePage, codeRowsPerPage],
    queryFn: () => adminApi.getRedeemCodes(codesFor!.id, {
      page: codePage,
      per_page: codeRowsPerPage,
      status: codeStatus,
    }),
    enabled: !!codesFor,
  })

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (d: any) => adminApi.createRedeemCampaign(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-redeem-campaigns'] })
      setCreateOpen(false)
      setNewCampaign(defaultNew)
      setSnack('Campaign dibuat')
    },
    onError: (e: any) => setSnack(`Error: ${e.message}`),
  })

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      adminApi.updateRedeemCampaign(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-redeem-campaigns'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deleteRedeemCampaign(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-redeem-campaigns'] })
      setSnack('Campaign dihapus')
    },
    onError: (e: any) => setSnack(`Error: ${e.message}`),
  })

  const generateMut = useMutation({
    mutationFn: ({ id, count }: { id: number; count: number }) =>
      adminApi.generateRedeemCodes(id, count),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-redeem-campaigns'] })
      qc.invalidateQueries({ queryKey: ['admin-redeem-codes'] })
      setRecentBatch(res.codes)
      setSnack(`${res.generated} kode dibuat`)
    },
    onError: (e: any) => setSnack(`Error: ${e.message}`),
  })

  if (user?.role !== 'admin') return <Alert severity='error'>Access denied</Alert>

  const campaigns = data?.campaigns ?? []
  const total = data?.total ?? 0

  return (
    <div className='flex flex-col gap-6'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant='h4'>Redeem Codes</Typography>
          <Typography variant='body2' color='text.secondary'>
            Giveaway codes — admin generate banyak kode, KOL/audience tukar di /redeem
          </Typography>
        </Box>
        <Button variant='contained' onClick={() => setCreateOpen(true)}>
          Create Campaign
        </Button>
      </Box>

      <Card>
        <CardContent sx={{ pb: '16px !important' }}>
          <TextField
            fullWidth size='small'
            placeholder='Cari campaign by name…'
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
                <TableCell>Name</TableCell>
                <TableCell>Reward</TableCell>
                <TableCell align='center'>Codes</TableCell>
                <TableCell>Expiry</TableCell>
                <TableCell align='center'>Active</TableCell>
                <TableCell align='right'>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{c.name}</Typography>
                    {c.description && (
                      <Typography variant='caption' color='text.secondary'>{c.description}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size='small' label={c.reward_label}
                      color={c.reward_type === 'subscription' ? 'warning' : 'info'}
                      variant='tonal'
                    />
                  </TableCell>
                  <TableCell align='center'>
                    <Tooltip title='Total / Redeemed'>
                      <Typography component='span' sx={{ fontFamily: 'monospace' }}>
                        {c.total_codes ?? 0} / <b>{c.redeemed_codes ?? 0}</b>
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString('id-ID') : '—'}
                  </TableCell>
                  <TableCell align='center'>
                    <Switch
                      checked={c.is_active}
                      onChange={() => toggleActiveMut.mutate({ id: c.id, is_active: !c.is_active })}
                    />
                  </TableCell>
                  <TableCell align='right'>
                    <Tooltip title='Generate kode'>
                      <IconButton size='small' onClick={() => { setGenerateFor(c); setGenCount(100); setRecentBatch([]) }}>
                        <i className='tabler-wand' />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title='Lihat kode'>
                      <IconButton size='small' onClick={() => setCodesFor(c)}>
                        <i className='tabler-list-details' />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title='Hapus campaign'>
                      <IconButton color='error' size='small' onClick={() => {
                        if (confirm(`Delete campaign "${c.name}"?`)) deleteMut.mutate(c.id)
                      }}>
                        <i className='tabler-trash' />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {campaigns.length === 0 && !isFetching && (
                <TableRow>
                  <TableCell colSpan={6} align='center'>
                    <Typography variant='body2' color='text.secondary' sx={{ py: 3 }}>
                      Belum ada campaign. Klik "Create Campaign" untuk mulai.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
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

      {/* Create campaign dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth='sm' fullWidth>
        <DialogTitle>Create Redeem Campaign</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label='Name' value={newCampaign.name}
              onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
              fullWidth required
              helperText='Misal: "Forza Horizon Launch Giveaway"'
            />
            <TextField label='Description (opsional)'
              value={newCampaign.description}
              onChange={e => setNewCampaign({ ...newCampaign, description: e.target.value })}
              fullWidth multiline minRows={2}
            />

            <FormControl fullWidth>
              <InputLabel>Reward Type</InputLabel>
              <Select
                value={newCampaign.reward_type}
                label='Reward Type'
                onChange={e => setNewCampaign({ ...newCampaign, reward_type: e.target.value as 'subscription' | 'game' })}
              >
                <MenuItem value='subscription'>Subscription</MenuItem>
                <MenuItem value='game'>Game (akses 1 game)</MenuItem>
              </Select>
            </FormControl>

            {newCampaign.reward_type === 'subscription' && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Plan</InputLabel>
                  <Select
                    value={newCampaign.reward_subscription_plan}
                    label='Plan'
                    onChange={e => setNewCampaign({
                      ...newCampaign,
                      reward_subscription_plan: e.target.value,
                      reward_subscription_duration_days: null,
                    })}
                  >
                    {SUBSCRIPTION_PLANS.map(p => (
                      <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                    ))}
                    <MenuItem value=''>Custom duration…</MenuItem>
                  </Select>
                </FormControl>
                {!newCampaign.reward_subscription_plan && (
                  <TextField
                    label='Durasi (hari)' type='number'
                    value={newCampaign.reward_subscription_duration_days ?? ''}
                    onChange={e => setNewCampaign({
                      ...newCampaign,
                      reward_subscription_duration_days: e.target.value ? +e.target.value : null,
                    })}
                    fullWidth
                  />
                )}
              </Box>
            )}

            {newCampaign.reward_type === 'game' && (
              <Autocomplete
                options={games?.games ?? []}
                getOptionLabel={(g) => g.name}
                value={games?.games?.find(g => g.id === newCampaign.reward_game_id) ?? null}
                onChange={(_, picked) => setNewCampaign({ ...newCampaign, reward_game_id: picked ? picked.id : null })}
                renderInput={(params) => <TextField {...params} label='Game' required />}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                fullWidth
              />
            )}

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label='Max Redeem per User' type='number'
                value={newCampaign.max_redemptions_per_user}
                onChange={e => setNewCampaign({ ...newCampaign, max_redemptions_per_user: Math.max(1, +e.target.value || 1) })}
                fullWidth
                helperText='Berapa kali 1 user boleh redeem dari campaign ini'
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label='Starts At (opsional)' type='datetime-local'
                value={newCampaign.starts_at}
                onChange={e => setNewCampaign({ ...newCampaign, starts_at: e.target.value })}
                fullWidth slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label='Expires At (opsional)' type='datetime-local'
                value={newCampaign.expires_at}
                onChange={e => setNewCampaign({ ...newCampaign, expires_at: e.target.value })}
                fullWidth slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant='contained' onClick={() => {
            const payload: any = {
              name: newCampaign.name,
              description: newCampaign.description || null,
              reward_type: newCampaign.reward_type,
              max_redemptions_per_user: newCampaign.max_redemptions_per_user,
              is_active: newCampaign.is_active,
              starts_at: newCampaign.starts_at ? new Date(newCampaign.starts_at).toISOString() : null,
              expires_at: newCampaign.expires_at ? new Date(newCampaign.expires_at).toISOString() : null,
            }

            if (newCampaign.reward_type === 'subscription') {
              payload.reward_subscription_plan = newCampaign.reward_subscription_plan || null
              payload.reward_subscription_duration_days = newCampaign.reward_subscription_duration_days
            } else {
              payload.reward_game_id = newCampaign.reward_game_id
            }
            createMut.mutate(payload)
          }} disabled={createMut.isPending || !newCampaign.name}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generate codes dialog */}
      <Dialog open={!!generateFor} onClose={() => setGenerateFor(null)} maxWidth='sm' fullWidth>
        <DialogTitle>
          Generate Codes
          {generateFor && (
            <Typography variant='body2' color='text.secondary'>{generateFor.name}</Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label='Jumlah kode'
              type='number'
              value={genCount}
              onChange={e => setGenCount(Math.min(10000, Math.max(1, +e.target.value || 1)))}
              fullWidth
              helperText='Maksimum 10.000 per request. Format: XXXX-XXXX-XXXX'
            />
            {generateMut.isPending && <LinearProgress />}
            {recentBatch.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant='body2' color='text.secondary'>
                    {recentBatch.length} kode baru:
                  </Typography>
                  <Button size='small' onClick={() => {
                    navigator.clipboard.writeText(recentBatch.join('\n'))
                    setSnack('Kode disalin ke clipboard')
                  }}>Copy all</Button>
                </Box>
                <Box sx={{
                  maxHeight: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: 12,
                  bgcolor: 'action.hover', p: 1.5, borderRadius: 1,
                }}>
                  {recentBatch.map(c => <div key={c}>{c}</div>)}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setGenerateFor(null)}>Tutup</Button>
          <Button variant='contained' onClick={() => {
            if (generateFor) generateMut.mutate({ id: generateFor.id, count: genCount })
          }} disabled={generateMut.isPending}>
            Generate {genCount}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Codes list dialog */}
      <Dialog open={!!codesFor} onClose={() => setCodesFor(null)} maxWidth='lg' fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <Box>
              <Typography variant='h6'>Codes — {codesFor?.name}</Typography>
              {codesData && (
                <Typography variant='body2' color='text.secondary'>
                  Total {codesData.campaign.total_codes ?? 0} · Redeemed {codesData.campaign.redeemed_codes ?? 0} · Available {codesData.campaign.available_codes ?? 0}
                </Typography>
              )}
            </Box>
            <Button
              variant='outlined'
              size='small'
              startIcon={<i className='tabler-download' />}
              onClick={() => {
                if (codesFor) window.open(adminApi.redeemCodesCsvUrl(codesFor.id), '_blank')
              }}
            >
              Export CSV
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <ToggleButtonGroup
              size='small'
              exclusive
              value={codeStatus}
              onChange={(_, v) => v && setCodeStatus(v)}
            >
              <ToggleButton value='all'>Semua</ToggleButton>
              <ToggleButton value='unredeemed'>Belum dipakai</ToggleButton>
              <ToggleButton value='redeemed'>Sudah dipakai</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Redeemed by</TableCell>
                <TableCell>Redeemed at</TableCell>
                <TableCell align='right'>Share link</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(codesData?.codes ?? []).map(rc => (
                <TableRow key={rc.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{rc.code}</TableCell>
                  <TableCell>
                    {rc.is_redeemed
                      ? <Chip size='small' color='success' label='Redeemed' />
                      : <Chip size='small' color='default' variant='tonal' label='Available' />}
                  </TableCell>
                  <TableCell>{rc.redeemed_by_email ?? '—'}</TableCell>
                  <TableCell>{rc.redeemed_at ? new Date(rc.redeemed_at).toLocaleString('id-ID') : '—'}</TableCell>
                  <TableCell align='right'>
                    <Tooltip title='Copy share link'>
                      <IconButton size='small' onClick={() => {
                        navigator.clipboard.writeText(buildShareLink(rc.code))
                        setSnack(`Link disalin: ${buildShareLink(rc.code)}`)
                      }}>
                        <i className='tabler-link' />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {codesFetching && (codesData?.codes ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} align='center'><LinearProgress /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component='div'
            count={codesData?.total ?? 0}
            page={codePage - 1}
            onPageChange={(_, p) => setCodePage(p + 1)}
            rowsPerPage={codeRowsPerPage}
            onRowsPerPageChange={e => setCodeRowsPerPage(parseInt(e.target.value, 10))}
            rowsPerPageOptions={[25, 50, 100, 200]}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCodesFor(null)}>Tutup</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3500} onClose={() => setSnack('')} message={snack} />
    </div>
  )
}

export default AdminRedeemPage
