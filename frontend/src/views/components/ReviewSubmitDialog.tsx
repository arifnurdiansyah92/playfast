'use client'

import { useEffect, useRef, useState } from 'react'

import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'

import { reviewsApi } from '@/lib/api'
import type { Review } from '@/lib/api'

const MAX_IMAGES = 4
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const gold = '#c9a84c'

interface Props {
  open: boolean
  onClose: () => void
  existing: Review | null  // null = create, set = edit
  onSaved?: (review: Review) => void
}

interface PreviewImage {

  // Already uploaded (existing review)
  id?: number
  url?: string

  // Newly added file pending upload
  file?: File
  preview?: string
}

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const ReviewSubmitDialog = ({ open, onClose, existing, onSaved }: Props) => {
  const [rating, setRating] = useState(5)
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState<PreviewImage[]>([])
  const [removedIds, setRemovedIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  // Track all outstanding blob URLs so we can revoke them regardless of how the dialog closes.
  const blobUrlsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      setError(null)
      setFileErrors([])
      setRemovedIds([])

      if (existing) {
        setRating(existing.rating)
        setHeadline(existing.headline ?? '')
        setBody(existing.body)
        setImages(existing.images.map(img => ({ id: img.id, url: img.url })))
      } else {
        setRating(5)
        setHeadline('')
        setBody('')
        setImages([])
      }
    }
  }, [open, existing])

  // Revoke any outstanding blob URLs when dialog closes (open → !open) or on unmount.
  useEffect(() => {
    if (open) return

    blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    blobUrlsRef.current.clear()
  }, [open])

  useEffect(() => () => {
    blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    blobUrlsRef.current.clear()
  }, [])

  const acceptFiles = (files: FileList | File[]) => {
    const arr = Array.from(files)

    const remaining = MAX_IMAGES - images.length

    if (remaining <= 0) {
      setFileErrors(prev => [...prev, `Maksimal ${MAX_IMAGES} foto sudah tercapai.`])

      return
    }

    const accepted: PreviewImage[] = []
    const newErrors: string[] = []

    for (const f of arr.slice(0, remaining)) {
      if (!ALLOWED.includes(f.type)) {
        newErrors.push(`${f.name} — format tidak didukung`)

        continue
      }

      if (f.size > MAX_BYTES) {
        newErrors.push(`${f.name} — melebihi 5 MB`)

        continue
      }

      const previewUrl = URL.createObjectURL(f)

      blobUrlsRef.current.add(previewUrl)
      accepted.push({ file: f, preview: previewUrl })
    }

    if (arr.length > remaining) {
      newErrors.push(`Hanya ${remaining} foto bisa ditambahkan (maks ${MAX_IMAGES}).`)
    }

    if (accepted.length > 0) {
      setFileErrors([])
      setImages(prev => [...prev, ...accepted])
    }

    if (newErrors.length > 0) {
      setFileErrors(prev => [...prev, ...newErrors])
    }
  }

  const removeImage = (idx: number) => {
    const img = images[idx]

    if (img.id !== undefined) setRemovedIds(prev => [...prev, img.id!])

    if (img.preview) {
      URL.revokeObjectURL(img.preview)
      blobUrlsRef.current.delete(img.preview)
    }

    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  const dismissFileError = (idx: number) => {
    setFileErrors(prev => prev.filter((_, i) => i !== idx))
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (submitting) return

    const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))

    if (files.length) {
      e.preventDefault()
      acceptFiles(files)
    }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!body.trim()) {
      setError('Isi review wajib diisi.')

      return
    }

    if (body.trim().length < 20) {
      setError('Review terlalu singkat (min 20 karakter).')

      return
    }

    setSubmitting(true)

    try {
      const newFiles = images.filter(i => !!i.file).map(i => i.file!) as File[]

      let saved: Review

      if (existing) {
        saved = await reviewsApi.editMine({
          rating,
          headline: headline.trim() || null,
          body: body.trim(),
          images: newFiles,
          delete_image_ids: removedIds,
        })
      } else {
        saved = await reviewsApi.submit({
          rating,
          headline: headline.trim() || undefined,
          body: body.trim(),
          images: newFiles,
        })
      }

      onSaved?.(saved)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan review.')
    } finally {
      setSubmitting(false)
    }
  }

  const atCapacity = images.length >= MAX_IMAGES

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      maxWidth='sm'
      fullWidth
      slotProps={{ paper: { sx: { bgcolor: '#14161c', backgroundImage: 'none' } } }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>
        {existing ? 'Edit Review Kamu' : 'Tulis Review'}
      </DialogTitle>

      <DialogContent
        onPaste={handlePaste}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}
      >
        {existing?.status === 'rejected' && existing?.admin_note && (
          <Alert severity='warning' sx={{ bgcolor: 'rgba(255,167,38,0.12)' }}>
            Review sebelumnya ditolak: <em>{existing.admin_note}</em>. Edit dan submit ulang untuk dipertimbangkan kembali.
          </Alert>
        )}

        <Box>
          <Typography variant='subtitle2' sx={{ mb: 1, fontWeight: 600 }}>Rating</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <IconButton
                key={s}
                onClick={() => setRating(s)}
                size='small'
                disabled={submitting}
                sx={{ p: 0.25 }}
              >
                <i
                  className={s <= rating ? 'tabler-star-filled' : 'tabler-star'}
                  style={{ fontSize: 32, color: s <= rating ? gold : 'rgba(154,160,166,0.4)' }}
                />
              </IconButton>
            ))}
          </Box>
        </Box>

        <TextField
          label='Judul (opsional)'
          placeholder='Mis. "Worth banget!"'
          value={headline}
          onChange={e => setHeadline(e.target.value.slice(0, 200))}
          fullWidth
          disabled={submitting}
          slotProps={{ htmlInput: { maxLength: 200 } }}
          helperText={`${headline.length}/200`}
        />

        <TextField
          label='Cerita pengalaman kamu'
          placeholder='Bagaimana pengalaman kamu pakai Playfast?'
          value={body}
          onChange={e => setBody(e.target.value.slice(0, 5000))}
          required
          fullWidth
          multiline
          minRows={4}
          maxRows={10}
          disabled={submitting}
          helperText={`${body.length}/5000 — minimal 20 karakter`}
        />

        <Box>
          <Typography variant='subtitle2' sx={{ mb: 1, fontWeight: 600 }}>
            Foto (opsional, max {MAX_IMAGES})
          </Typography>

          {fileErrors.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1.5 }}>
              {fileErrors.map((msg, idx) => (
                <Chip
                  key={`${idx}-${msg}`}
                  label={msg}
                  size='small'
                  onDelete={() => dismissFileError(idx)}
                  deleteIcon={<i className='tabler-x' style={{ fontSize: 14 }} />}
                  sx={{
                    bgcolor: 'rgba(244,67,54,0.12)',
                    color: '#f08a82',
                    border: '1px solid rgba(244,67,54,0.3)',
                    justifyContent: 'space-between',
                    '& .MuiChip-label': { px: 1 },
                    '& .MuiChip-deleteIcon': { color: '#f08a82', mr: 0.5, '&:hover': { color: '#fff' } },
                  }}
                />
              ))}
            </Box>
          )}

          <Box
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files?.length) acceptFiles(e.dataTransfer.files)
            }}
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? gold : 'rgba(154,160,166,0.3)',
              borderRadius: 2,
              p: 4,
              minHeight: 140,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              bgcolor: dragOver ? 'rgba(201,168,76,0.05)' : 'transparent',
              transition: 'all 0.15s ease',
              cursor: 'pointer',
              opacity: atCapacity || submitting ? 0.5 : 1,
              pointerEvents: atCapacity || submitting ? 'none' : 'auto',
            }}
            component='label'
          >
            <input
              type='file'
              accept='image/jpeg,image/png,image/webp,image/gif'
              multiple
              hidden
              onChange={e => {
                if (e.target.files?.length) acceptFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <i
              className='tabler-cloud-upload'
              style={{
                fontSize: 48,
                color: dragOver ? gold : 'rgba(154,160,166,0.6)',
                transition: 'color 0.15s ease',
              }}
            />
            {atCapacity ? (
              <Typography variant='body1' sx={{ mt: 1.5, fontWeight: 600, color: 'text.secondary' }}>
                ✓ Maksimal foto sudah tercapai. Hapus salah satu untuk ganti.
              </Typography>
            ) : (
              <>
                <Typography variant='body1' sx={{ mt: 1.5, fontWeight: 600 }}>
                  📸 Tarik foto ke sini atau klik untuk pilih
                </Typography>
                <Typography variant='caption' sx={{ mt: 0.5, color: 'text.secondary' }}>
                  JPG / PNG / WEBP / GIF · Maks 5 MB per foto · {images.length}/{MAX_IMAGES} terisi
                </Typography>
              </>
            )}
          </Box>

          {images.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
              {images.map((img, idx) => (
                <Box key={img.id ?? `new-${idx}`} sx={{ width: 96 }}>
                  <Box sx={{ position: 'relative', width: 96, height: 96 }}>
                    <Box
                      component='img'
                      src={img.url ?? img.preview}
                      alt=''
                      sx={{ width: 96, height: 96, borderRadius: 1.5, objectFit: 'cover', border: '1px solid rgba(154,160,166,0.25)' }}
                    />
                    <IconButton
                      onClick={() => removeImage(idx)}
                      size='small'
                      disabled={submitting}
                      sx={{
                        position: 'absolute', top: -8, right: -8,
                        bgcolor: 'rgba(0,0,0,0.85)', color: '#fff',
                        width: 22, height: 22,
                        '&:hover': { bgcolor: '#000' },
                      }}
                    >
                      <i className='tabler-x' style={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                  {img.file && (
                    <Typography
                      variant='caption'
                      sx={{
                        display: 'block',
                        mt: 0.5,
                        textAlign: 'center',
                        color: 'text.secondary',
                        fontSize: 11,
                        lineHeight: 1.2,
                      }}
                    >
                      {formatSize(img.file.size)}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {existing?.status === 'pending' && (
          <Chip label='Status: menunggu approval admin' size='small' color='warning' variant='outlined' />
        )}

        {error && <Alert severity='error'>{error}</Alert>}

        <Typography variant='caption' sx={{ color: 'text.secondary' }}>
          Review akan dimoderasi admin sebelum tampil publik. Email kamu akan ditampilkan dengan format <strong>ris***@gmail.com</strong>.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Batal</Button>
        <Button
          onClick={handleSubmit}
          variant='contained'
          disabled={submitting}
          sx={{ bgcolor: gold, color: '#000', fontWeight: 700, '&:hover': { bgcolor: '#dfc06a' }, display: 'flex', alignItems: 'center', gap: 1 }}
        >
          {submitting && <CircularProgress size={16} sx={{ color: '#000' }} />}
          {submitting ? 'Menyimpan...' : existing ? 'Simpan Perubahan' : 'Kirim Review'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ReviewSubmitDialog
