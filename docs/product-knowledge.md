# Playfast — Product Knowledge

Dokumen referensi internal yang menjelaskan cara kerja Playfast, aturan main, dan jawaban atas pertanyaan umum. Sumber kebenaran untuk: FAQ, copy marketing, pelatihan support, briefing kolaborasi influencer, dan onboarding tim ke depan.

---

## 1. Apa itu Playfast

Playfast adalah platform berbagi akun Steam yang memungkinkan gamer Indonesia main game premium dengan harga sangat murah — mulai **Rp 50 ribu per game** (dibandingkan harga Steam asli yang bisa Rp 200K – 800K+).

**Caranya:** Playfast beli akun Steam original yang punya banyak game, lalu menyewakan akses login akun tersebut ke beberapa user secara bergantian. Semua akses pakai login resmi Steam — bukan crack, bukan bajakan, bukan akun curian.

**Target market:** gamer Indonesia yang ingin main game AAA tanpa keluar uang setara harga Steam region US.

---

## 2. Model bisnis: Akun Sharing

### Bagaimana sharing-nya bekerja

- Satu akun Steam dimiliki Playfast, tapi bisa di-share ke **banyak user** secara non-simultan
- User dapat **username + password resmi** akun Steam-nya saat order disetujui
- User login pakai **Steam Guard otomatis** (kode OTP di-generate Playfast server, tidak perlu install Steam Mobile App)
- Setelah game ter-install, user **wajib pindah ke Mode Offline** untuk main → akun bisa dipakai user lain secara bergantian

### Kenapa model ini legal & aman

- Akun original Steam, dibeli langsung oleh Playfast (bukan akun hasil hack/curi)
- Sharing kredensial sendiri **tidak dilarang Steam ToS** — yang dilarang adalah sub-license / jual akun. Playfast model adalah akses temporary, bukan transfer ownership.
- Risiko utama: Steam dapat flag akun kalau pola login mencurigakan (multi-IP simultan, perubahan setting, dsb) — ini di-mitigasi via aturan Mode Offline (lihat §4)

---

## 3. Steam Guard (OTP otomatis)

Salah satu **fitur diferensiasi utama** Playfast — user tidak perlu install Steam Mobile App.

### Cara kerja

- Setiap akun Playfast punya `shared_secret` yang disimpan dari file `.maFile` (Steam Desktop Authenticator format)
- Server Playfast generate **TOTP code** real-time (rotasi tiap 30 detik) berdasarkan `shared_secret`
- User klik tombol **"Buat Kode"** di halaman order → kode muncul → masukkan ke prompt Steam Guard

### User experience

- Login Steam → masuk username/password → Steam minta Steam Guard code
- User buka halaman Playfast order → klik tombol → kode tampil
- Masuk kode ke Steam → login sukses

Tanpa fitur ini, user harus minta admin manual setiap kali login → ga scalable.

---

## 4. Aturan utama: Mode Offline

**Aturan paling penting di Playfast.** Pelanggaran = risiko ke seluruh sistem.

### Kapan online dibolehkan

**Hanya saat aktivasi awal:**

1. Login pertama kali ke Steam (mode online by default)
2. Download/install game dari Library
3. Setelah download selesai → **langsung Go Offline**

**Setelah download selesai, user TIDAK BOLEH login lagi dalam mode online.**

### Cara aktifin Mode Offline

Steam menu (pojok kiri atas) → **Go Offline** → Steam restart dalam mode offline → game bisa dimainkan tanpa koneksi Steam server.

### Kenapa wajib offline

1. **Mencegah konflik user lain.** Kalau user A online, user B yang lagi main bakal **ke-kick keluar** karena Steam policy "single online session per account".
2. **Hindari Steam flag.** Login dari banyak IP berbeda dalam waktu dekat → akun di-flag → dalam kasus ekstrim Steam suspend akun.
3. **Privasi.** Mode online expose game activity ke semua "friends" akun — yang berarti user lain bisa lihat aktivitas user yang lagi online.

### Konsekuensi pelanggaran

- **Soft case:** akun ke-flag → Playfast rotate akun, semua user di akun itu kena downtime
- **Hard case:** akun di-ban permanen → Playfast harus refund + beli akun baru → harga ke depan bisa naik
- User yang ketahuan melanggar berulang dapat di-ban dari Playfast

---

## 5. Game Request

User bisa request game yang belum ada di katalog Playfast.

### Cara request

- User submit **link Steam Store** (contoh: `https://store.steampowered.com/app/1091500/Cyberpunk_2077/`)
- Sistem fetch metadata game otomatis dari Steam (nama, gambar, harga)
- Request masuk ke admin queue dengan vote awal dari user yang submit

### Sistem voting

- Kalau user lain request game **yang sama**, vote count nambah (bukan duplicate request)
- Admin sort queue by vote count → prioritas beli game yang paling diminati
- Vote bisa di-batalkan user kapan aja (selama status masih `pending`)

### Status request

- `pending` — masih dalam antrian admin
- `added` — admin sudah beli akun yang punya game ini, game muncul di katalog
- `rejected` — admin tolak (alasan ditampilkan ke voter)

### Notifikasi voter

Saat admin mark request `added`, **semua voter** otomatis dapat email notif "game-mu sudah tersedia" dengan link langsung ke game-nya.

### Edge case: game sudah di katalog tapi habis stok

Kalau game ada di katalog tapi **0 akun aktif** punya game itu (out of stock) → user **tetap bisa request** (sistem treat sebagai sinyal restock demand). Kalau request sebelumnya sudah `added`, otomatis dibuka kembali ke `pending` supaya admin lihat demand baru.

### Rate limit

Max 10 game request **baru** per user per hari (vote ke request yang sudah ada tidak dihitung).

---

## 6. Pricing & Subscription

### Beli per game (one-off)

- Harga mulai **Rp 50.000 per game**
- Akses lifetime untuk game tersebut (selama akun & game masih ada di Playfast)

### Subscription Premium

- Bayar bulanan / tahunan → akses ke **semua game di katalog**
- Perks tambahan: prioritas game request, akses early ke game baru
- Pricing detail di halaman `/subscribe`

### Promo & referral

- **Kode promo** — admin bisa generate kode (per influencer atau campaign)
- **Referral system** — user yang refer dapat reward kalau referee complete pembelian
- Sistem trackable per kode (penting untuk ROI measurement collab)

### Pembayaran

- Transfer manual (BCA/lainnya) → user upload bukti → admin konfirmasi manual
- Setelah konfirmasi, status order jadi `fulfilled` dan kredensial otomatis di-assign

---

## 7. Yang JANGAN dilakukan

Aturan untuk semua user akun Playfast:

| Larangan | Alasan |
|----------|--------|
| Main dalam mode online setelah aktivasi | Kick user lain, expose ke flag Steam |
| Ubah password atau email akun | User lain ga bisa login → akun lockout |
| Add friend / accept invite / chat di Steam | Mengundang DMCA, scam, atau kenalan iseng |
| Ubah profile, avatar, status, settings akun | Akun jadi "personalized" → kelihatan janggal kalau dipakai orang lain |
| Login akun ke banyak device simultan | Multi-IP trigger Steam fraud detection |
| Share kredensial ke pihak lain di luar Playfast | Pelanggaran ToS Playfast, risiko bocoran ke account marketplaces |
| Pakai akun untuk main online multiplayer dengan akun pribadi | Steam bisa link kedua akun → flag |
| Beli/aktifkan DLC pakai akun Playfast | Jadi milik akun, ga bisa di-pull balik kalau user pindah |
| Refund game via Steam | Akun kena flag refund abuse |

---

## 8. Refund & masalah

### Refund policy

- **Refund handled manual oleh admin** (case by case)
- Kondisi refund umum: akun di-ban Steam, game tidak bisa diakses, masalah teknis dari Playfast side
- **Bukan refund-able:** user salah beli game, user tidak puas dengan game, user melanggar aturan Mode Offline

### Channel support

- **Email balasan** ke email order (admin baca, response same-day)
- **WhatsApp** — nomor di-display di promo banner & contact page (pull dari settings, bukan hardcode)

### Saat akun bermasalah

- User report via WA / email
- Admin verify (Steam flag, ban, dsb)
- Kalau confirmed Playfast-side issue → admin assign akun baru atau refund
- Kalau confirmed user-side violation → no refund + warning, repeat = ban dari Playfast

---

## 9. Brand & messaging guidelines

Untuk konten marketing, copywriting, dan kolaborasi:

### Tone of voice

- **Casual + jelas** — pakai "kamu", bukan "Anda" formal
- **No hype palsu** — value prop sudah cukup kuat tanpa over-promise
- **Jujur soal model** — selalu jelaskan ini sharing legitimate, bukan crack/bajakan

### Wajib disebut di setiap collab content

1. Domain: `playfast.id`
2. Price anchor: "mulai dari Rp 50 ribu" atau setara
3. Benefit utama: "OTP otomatis" / "login langsung tanpa Steam mobile app"
4. Trust signal: "100% original Steam (akses legit via akun bersama, BUKAN akun crack/bajakan)"
5. Promo code (kalau ada): di-spell out + flash di layar untuk video

### Forbidden phrasing

Hindari frasa berikut di copy/script/post:

- **"Akun curian" / "akun crack" / "akun bajakan"** — Playfast BUKAN itu
- **"Akun gratis"** — ini paid service, bukan freebie
- **"Hack Steam" / "trick Steam"** — bukan hacking, ini model sharing legit
- **Janji "100% no risk"** — Steam bisa flag akun kapanpun, jangan over-promise

### Channel marketing utama

- **Influencer collab** dengan content creator Indonesia di niche game-discount / game-deal info
- **Faceless content** (screen recording + voice over) di IG Reels / TikTok
- Komunitas Discord / Facebook group gamer Indonesia (genuine sharing, bukan spam)
- Bukan prioritas: Product Hunt (audience global), blog SEO (terlalu lambat untuk early stage)

---

## 10. FAQ singkat

**Q: Apakah ini legal?**  
A: Ya. Playfast beli akun Steam original dan share aksesnya secara temporary ke user. Sharing kredensial tidak dilarang Steam — yang dilarang adalah jual / transfer ownership akun.

**Q: Akunnya bisa dibanned ga?**  
A: Risiko ada (sama seperti akun Steam apapun), tapi di-mitigasi via aturan Mode Offline + kebijakan jangan ubah settings akun. Selama user ikut aturan, risiko sangat rendah.

**Q: Game-nya bisa main online multiplayer?**  
A: **Tidak.** Playfast khusus single-player game. Multi-player butuh mode online → conflict dengan model sharing. Game multiplayer tetap muncul di Library tapi tidak disarankan dimainkan via Playfast.

**Q: Berapa lama akses-nya?**  
A: Untuk pembelian per-game: lifetime, selama akun & game masih ada. Untuk subscription: selama subscription aktif.

**Q: Saya bisa main game ini sambil teman saya juga main?**  
A: **Tidak simultan di akun yang sama.** Steam policy "one online session per account". Tapi kalau teman kamu beli akses sendiri (akun yang berbeda), bisa.

**Q: Save game saya hilang kalau pindah akun?**  
A: Save game disimpan di lokal komputer + Steam Cloud per akun. Kalau pindah akun, save lokal masih ada tapi cloud save akan reset. Backup save lokal sebelum pindah.

**Q: Akun yang saya pakai tiba-tiba kena banned, gimana?**  
A: Lapor ke admin via WA / email. Admin verify, kalau confirmed bukan karena pelanggaran user → assign akun pengganti atau refund.

**Q: Bisa request game yang belum ada?**  
A: Bisa — submit Steam URL via halaman game request. Kalau banyak yang request game sama, prioritas admin naik. Voter dinotif via email saat game ditambahkan.

**Q: Kenapa harus pakai Mode Offline?**  
A: Karena akunnya di-share. Mode online akan kick user lain yang lagi main. Selalu Go Offline setelah download selesai.

---

## 11. Tech & infra ringkas

Untuk konteks tim/kolaborator teknis:

- **Backend:** Python / Flask + SQLAlchemy
- **Frontend:** Next.js + TypeScript + MUI
- **Steam integration:** custom client di `steam_client.py` + `steam_guard.py` (TOTP generation)
- **Email:** Brevo SMTP (transactional + email blast)
- **Hosting:** VPS dengan Docker Compose deployment
- **Domain:** `playfast.id`
- **Admin tools:** dashboard, account management, game catalog, email blast, promo codes, game requests, audit log

Detail teknis lebih lanjut: lihat `.planning/`, `docs/superpowers/specs/`, dan `CLAUDE.md` di repo.

---

*Last updated: 2026-05-07*
