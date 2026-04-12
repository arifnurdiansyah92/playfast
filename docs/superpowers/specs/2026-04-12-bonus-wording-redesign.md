# Bonus Wording Redesign

## Goal

Redesign the user-facing bonus section on the "Game Saya" (My Games) page so users understand what bonus games are, that they are temporary, and that their purchased game is always guaranteed.

## Scope

Single file change: `frontend/src/views/my-games/MyGamesPage.tsx`

## Changes

### 1. Wording updates

**Subtitle** (game count display):
- Before: `5 game dibeli + 3 bonus`
- After: `5 game dibeli · 3 bonus tersedia`

**Bonus card caption** (below account name on bonus cards):
- Before: `Gratis dari akun yang sama`
- After: `Bonus · Selama akun tersedia`

### 2. "Apa itu game bonus?" link

- Small clickable text link with `tabler-info-circle` icon
- Positioned right-aligned on the same row as the Tabs component
- Only visible when bonus games exist (same condition as tabs)
- Muted text color, clickable

Layout:
```
[ Semua (8) | Dibeli (5) | Bonus (3) ]          Apa itu game bonus? (i)
```

### 3. Info dialog

Triggered by clicking the link above. MUI Dialog with:

**Title:** Apa itu Game Bonus?

**Section 1 — icon: `tabler-gift`, heading: "Apa itu bonus?"**
Game bonus adalah game tambahan yang kebetulan tersedia di akun Steam yang sama dengan game yang kamu beli. Selama akun tersebut aktif, kamu bisa memainkan game bonus secara gratis.

**Section 2 — icon: `tabler-refresh`, heading: "Bonus bisa berubah"**
Akun Steam yang kamu gunakan bisa diganti sewaktu-waktu. Jika akun diganti, game bonus dari akun sebelumnya tidak akan tersedia lagi. Game bonus baru mungkin muncul dari akun pengganti.

**Section 3 — icon: `tabler-shield-check`, heading: "Game yang kamu beli tetap aman"**
Jika terjadi sesuatu pada akun (banned, masalah teknis, dll), kami akan mengganti akun kamu agar tetap bisa memainkan game yang kamu beli. Game bonus tidak termasuk dalam jaminan ini.

**Close button:** "Mengerti" (contained button)

## What stays the same

- Green "BONUS" chip with gift icon on cards
- Green border styling on bonus cards
- Tab filtering logic (Semua / Dibeli / Bonus)
- All backend logic unchanged

## No backend changes required
