'use client'

import { useEffect, useMemo, useReducer, useState } from 'react'

import { useRouter } from 'next/navigation'

import { storeApi, formatIDR } from '@/lib/api'

const SESSION_KEY = 'playfast.landingPromoBanner.dismissed'
const WA_NUMBER = '6282240708329'
const PROMO_END = new Date('2026-05-16T00:00:00+07:00').getTime()
const PROMO_START_LABEL = '24 APR'
const PROMO_END_LABEL = '15 MEI 2026'
const REGULAR_PRICE = 599000

const PF = {
  gold: '#d4a53a',
  goldLight: '#e8c266',
  goldDeep: '#a67b1a',
  ink: '#0f1420',
  inkDeep: '#07090f',
  cream: '#f6f4ef',
  mist: '#e7e3d9',
  steel: '#7a8599',
  red: '#e04a3b',
}

const FONTS = {
  display: "'Nunito', system-ui, -apple-system, Segoe UI, sans-serif",
  body: "'Inter', system-ui, -apple-system, Segoe UI, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
}

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap'

const BANNER_CSS = `
@keyframes pfPromoFade { from { opacity: 0 } to { opacity: 1 } }

.pf-promo-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(7, 9, 15, 0.72);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  animation: pfPromoFade 0.25s ease-out;
}
.pf-promo-overlay-inner {
  width: 100%;
  display: flex; justify-content: center;
  margin: auto 0;
}

.pf-promo-grid {
  position: relative; z-index: 2;
  display: grid; grid-template-columns: 1.05fr 1fr;
  gap: 32px; padding: 44px 48px; align-items: stretch;
}
.pf-promo-left { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.pf-promo-right { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; }
.pf-promo-wordmark { font-size: 40px; }
.pf-promo-headline { font-size: 56px; }
.pf-promo-price-digits { font-size: 110px; }

.pf-promo-close-btn {
  position: absolute; top: 14px; right: 14px;
  width: 40px; height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(212,165,58,0.4);
  background: rgba(15,20,32,0.85);
  color: #f6f4ef;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 5;
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  transition: transform 0.15s ease, background 0.15s ease;
}
.pf-promo-close-btn:hover, .pf-promo-close-btn:focus-visible {
  background: rgba(224, 74, 59, 0.95);
  transform: scale(1.05);
  outline: none;
}
.pf-promo-close-btn svg { width: 18px; height: 18px; }

.pf-promo-cta {
  margin-top: 18px;
  display: inline-flex; align-items: center; justify-content: center; gap: 12px;
  padding: 16px 28px;
  border-radius: 12px;
  border: none; cursor: pointer;
  font-family: 'Nunito', sans-serif;
  font-size: 18px; font-weight: 900;
}

.pf-promo-secondary-close {
  margin-top: 10px;
  background: none; border: none; cursor: pointer;
  color: rgba(246,244,239,0.65);
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 500;
  padding: 8px 16px;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.pf-promo-secondary-close:hover { color: #f6f4ef; }

@media (max-width: 900px) {
  .pf-promo-grid { grid-template-columns: 1fr; gap: 24px; padding: 32px 24px 28px; }
  .pf-promo-headline { font-size: 40px; }
  .pf-promo-wordmark { font-size: 34px; }
  .pf-promo-price-digits { font-size: 90px; }
}
@media (max-width: 600px) {
  .pf-promo-overlay { padding: 10px; }
  .pf-promo-grid { padding: 68px 18px 24px; gap: 20px; }
  .pf-promo-headline { font-size: 34px; }
  .pf-promo-price-digits { font-size: 76px; }
  .pf-promo-close-btn {
    top: 10px; right: 10px;
    width: 48px; height: 48px;
    background: rgba(15,20,32,0.95);
    border: 2px solid rgba(212,165,58,0.6);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .pf-promo-close-btn svg { width: 22px; height: 22px; }
  .pf-promo-cta { width: 100%; padding: 16px 20px; font-size: 17px; }
  .pf-promo-secondary-close { font-size: 14px; padding: 12px 16px; }
}
@media (max-width: 380px) {
  .pf-promo-headline { font-size: 30px; }
  .pf-promo-price-digits { font-size: 64px; }
}
`

function useNow() {
  const [, tick] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    const id = setInterval(tick, 500)

    
return () => clearInterval(id)
  }, [])
  
return Date.now()
}

function useAnimTime() {
  const [t, setT] = useState(0)

  useEffect(() => {
    const start = performance.now()
    let raf = 0

    const tick = () => {
      setT((performance.now() - start) / 1000)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    
return () => cancelAnimationFrame(raf)
  }, [])
  
return t
}

function useBannerAssets() {
  useEffect(() => {
    if (typeof document === 'undefined') return

    if (!document.querySelector(`link[data-pf-promo-fonts="1"]`)) {
      const link = document.createElement('link')

      link.rel = 'stylesheet'
      link.href = FONT_HREF
      link.setAttribute('data-pf-promo-fonts', '1')
      document.head.appendChild(link)
    }

    if (!document.querySelector(`style[data-pf-promo-css="1"]`)) {
      const style = document.createElement('style')

      style.setAttribute('data-pf-promo-css', '1')
      style.textContent = BANNER_CSS
      document.head.appendChild(style)
    }
  }, [])
}

function Countdown() {
  const now = useNow()
  const diff = Math.max(0, PROMO_END - now)
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const mins = Math.floor((diff / (1000 * 60)) % 60)
  const secs = Math.floor((diff / 1000) % 60)
  const pad = (n: number) => String(n).padStart(2, '0')

  const units = [
    { v: pad(days), l: 'HARI' },
    { v: pad(hours), l: 'JAM' },
    { v: pad(mins), l: 'MENIT' },
    { v: pad(secs), l: 'DETIK' },
  ]

  
return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
      {units.map((u, i) => (
        <div key={u.l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: 'rgba(15, 20, 32, 0.55)',
              border: `1px solid ${PF.gold}44`,
              borderRadius: 10,
              padding: '8px 12px',
              minWidth: 56,
              backdropFilter: 'blur(4px)',
            }}
          >
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 26,
                fontWeight: 900,
                color: PF.cream,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {u.v}
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 9,
                color: PF.gold,
                letterSpacing: '0.15em',
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {u.l}
            </div>
          </div>
          {i < units.length - 1 && (
            <div style={{ color: PF.gold, fontSize: 20, fontWeight: 900, opacity: 0.5, marginTop: -6 }}>:</div>
          )}
        </div>
      ))}
    </div>
  )
}

type Props = {
  open: boolean
  onClose: () => void
  promoPrice: number
  regularPrice: number
  onCtaClick: () => void
}

function BannerContent({ onClose, promoPrice, regularPrice, onCtaClick }: Omit<Props, 'open'>) {
  const t = useAnimTime()
  const shimmerX = ((t * 60) % 420) - 100
  const breathe = 1 + Math.sin(t * 1.3) * 0.015
  const tilt = Math.sin(t * 0.9) * 2
  const btnPulse = 1 + Math.sin(t * 2.2) * 0.015

  const bigPrice = useMemo(() => {
    // Show e.g. 250 for 250,000 → "250 RIBU"; 1,250,000 → "1,25 JUTA"
    if (promoPrice >= 1_000_000) {
      const juta = promoPrice / 1_000_000
      const label = Number.isInteger(juta) ? String(juta) : juta.toFixed(2).replace('.', ',').replace(/,?0+$/, '')

      
return { digits: label, unit: 'JUTA' }
    }

    const ribu = Math.round(promoPrice / 1000)

    
return { digits: String(ribu), unit: 'RIBU' }
  }, [promoPrice])

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label='Promo Playfast Lifetime'
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 1120,
        borderRadius: 20,
        overflow: 'hidden',
        background: `
          radial-gradient(ellipse at 15% 30%, ${PF.gold}22 0%, transparent 50%),
          radial-gradient(ellipse at 85% 70%, ${PF.goldDeep}33 0%, transparent 55%),
          linear-gradient(135deg, #1a1712 0%, #0f0c08 60%, #050403 100%)
        `,
        boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(212,165,58,0.2)',
        color: PF.cream,
      }}
    >
      {/* Diagonal stripes */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `repeating-linear-gradient(-25deg, transparent 0, transparent 40px, ${PF.gold}06 40px, ${PF.gold}06 41px)`,
          pointerEvents: 'none',
        }}
      />
      {/* Dot grid */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${PF.gold}22 1px, transparent 1.5px)`,
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at center, black 10%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 10%, transparent 70%)',
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />

      {/* Close button — bigger tap target on mobile via .pf-promo-close-btn */}
      <button
        type='button'
        onClick={onClose}
        aria-label='Tutup promo'
        className='pf-promo-close-btn'
      >
        <svg viewBox='0 0 24 24' fill='none' aria-hidden>
          <path d='M6 6l12 12M18 6L6 18' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' />
        </svg>
      </button>

      {/* Layout */}
      <div className='pf-promo-grid'>
        {/* ── LEFT ── */}
        <div className='pf-promo-left'>
          {/* eyebrow */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px',
                background: `linear-gradient(135deg, ${PF.gold} 0%, ${PF.goldDeep} 100%)`,
                borderRadius: 999,
                boxShadow: `0 4px 14px ${PF.gold}55`,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 4, background: PF.ink }} />
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: PF.ink,
                  letterSpacing: '0.22em',
                }}
              >
                PROMO TERBATAS · LIFETIME DEAL
              </span>
            </div>

            {/* Wordmark */}
            <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 0 }}>
              <div
                style={{
                  width: 78,
                  height: 78,
                  marginLeft: -12,
                  marginRight: -12,
                  transform: `scale(${breathe}) rotate(${tilt}deg)`,
                  filter: `drop-shadow(0 6px 14px ${PF.gold}66)`,
                  flexShrink: 0,
                }}
              >
                <img
                  src='/images/brand/playfast-icon.png'
                  alt=''
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div
                className='pf-promo-wordmark'
                style={{
                  fontFamily: FONTS.display,
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  color: PF.cream,
                  whiteSpace: 'nowrap',
                }}
              >
                play<span style={{ color: PF.gold }}>fast</span>
                <span style={{ color: PF.cream }}>.id</span>
              </div>
            </div>
          </div>

          {/* Headline */}
          <div style={{ marginTop: 24 }}>
            <div
              className='pf-promo-headline'
              style={{
                fontFamily: FONTS.display,
                fontWeight: 900,
                lineHeight: 0.95,
                color: PF.cream,
                letterSpacing: '-0.03em',
              }}
            >
              Subscribe
              <br />
              <span
                style={{
                  background: `linear-gradient(135deg, ${PF.goldLight} 0%, ${PF.gold} 50%, ${PF.goldDeep} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Sekali,
              </span>{' '}
              <span style={{ color: PF.cream }}>Main</span>
              <br />
              <span style={{ color: PF.cream }}>Selamanya.</span>
            </div>
            <div
              style={{
                marginTop: 16,
                fontFamily: FONTS.body,
                fontSize: 15,
                fontWeight: 500,
                color: '#c8ccd4',
                lineHeight: 1.5,
                maxWidth: 480,
              }}
            >
              Akses <span style={{ color: PF.gold, fontWeight: 700 }}>semua 300+ game Steam</span> di katalog kami —
              satu kali bayar, tanpa biaya bulanan, tanpa batas waktu.
            </div>
          </div>

          {/* Date range */}
          <div
            style={{
              marginTop: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              fontFamily: FONTS.mono,
              fontSize: 11,
              color: PF.gold,
              fontWeight: 600,
              letterSpacing: '0.16em',
            }}
          >
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' aria-hidden>
              <rect x='3' y='5' width='18' height='16' rx='2' stroke={PF.gold} strokeWidth='2' />
              <path d='M3 9h18M8 3v4M16 3v4' stroke={PF.gold} strokeWidth='2' strokeLinecap='round' />
            </svg>
            <span>
              {PROMO_START_LABEL} → {PROMO_END_LABEL}
            </span>
            <span style={{ color: PF.red, fontWeight: 700 }}>· BERAKHIR DALAM:</span>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className='pf-promo-right'>
          <div
            style={{
              position: 'relative',
              background: `linear-gradient(180deg, ${PF.cream} 0%, ${PF.mist} 100%)`,
              borderRadius: 20,
              padding: '32px 36px 28px',
              boxShadow: `0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px ${PF.gold}77, inset 0 0 0 4px ${PF.gold}`,
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            {/* LIFETIME stamp */}
            <div
              style={{
                position: 'absolute',
                top: 18,
                right: -44,
                background: PF.red,
                color: PF.cream,
                fontFamily: FONTS.display,
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.24em',
                padding: '5px 52px',
                transform: 'rotate(30deg)',
                boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
              }}
            >
              LIFETIME
            </div>

            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: PF.steel,
                letterSpacing: '0.24em',
                fontWeight: 600,
              }}
            >
              HARGA PROMO
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: FONTS.body,
                fontSize: 14,
                color: PF.steel,
                textDecoration: 'line-through',
                textDecorationColor: PF.red,
                textDecorationThickness: 2,
              }}
            >
              harga reguler {formatIDR(regularPrice)}
            </div>

            {/* Big price */}
            <div
              className='pf-promo-price'
              style={{
                marginTop: 10,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                position: 'relative',
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 30,
                  fontWeight: 800,
                  color: PF.ink,
                  marginTop: 20,
                }}
              >
                Rp
              </span>
              <div style={{ position: 'relative' }}>
                <span
                  className='pf-promo-price-digits'
                  style={{
                    fontFamily: FONTS.display,
                    fontWeight: 900,
                    letterSpacing: '-0.05em',
                    lineHeight: 0.85,
                    color: PF.gold,
                    textShadow: `0 3px 0 ${PF.goldDeep}, 0 6px 20px ${PF.gold}44`,
                    fontVariantNumeric: 'tabular-nums',
                    position: 'relative',
                  }}
                >
                  {bigPrice.digits}
                </span>
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: shimmerX,
                    width: 60,
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                    pointerEvents: 'none',
                    mixBlendMode: 'overlay',
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 30,
                  fontWeight: 800,
                  color: PF.ink,
                  alignSelf: 'flex-end',
                  marginBottom: 12,
                }}
              >
                {bigPrice.unit}
              </span>
            </div>

            <div
              style={{
                marginTop: 6,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: PF.steel,
                fontWeight: 500,
              }}
            >
              sekali bayar · tanpa langganan · tanpa biaya tambahan
            </div>

            {/* Features */}
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px dashed ${PF.gold}66`,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              {['Akses 300+ game Steam', '100% Original', 'OTP Otomatis 24/7', 'Garansi akun selamanya'].map(f => (
                <div
                  key={f}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontFamily: FONTS.body,
                    fontSize: 12,
                    fontWeight: 600,
                    color: PF.ink,
                  }}
                >
                  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' style={{ flexShrink: 0 }} aria-hidden>
                    <circle cx='12' cy='12' r='10' fill={PF.gold} />
                    <path
                      d='M7 12l3 3 7-7'
                      stroke={PF.ink}
                      strokeWidth='3'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    />
                  </svg>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA button — full-width on mobile via .pf-promo-cta */}
          <button
            type='button'
            onClick={onCtaClick}
            className='pf-promo-cta'
            style={{
              background: `linear-gradient(180deg, ${PF.gold} 0%, ${PF.goldDeep} 100%)`,
              boxShadow: `0 6px 0 ${PF.goldDeep}, 0 12px 28px ${PF.gold}55`,
              transform: `scale(${btnPulse})`,
              color: PF.ink,
            }}
          >
            <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor' aria-hidden>
              <path d='M17.5 14.2c-.3-.2-1.7-.9-2-1-.3-.1-.4-.1-.6.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.7-1.4-1.6-1.6-1.9-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4-.1-.5-.1-.2-.6-1.5-.9-2-.2-.5-.5-.5-.6-.5H7.9c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.4.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4 0-.1-.3-.2-.6-.3z' />
              <path
                d='M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.5.8 3.2 1.3 4.9 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-3-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C3.9 15 3.5 13.5 3.5 12c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5-3.8 8.2-8.5 8.2z'
                fill='currentColor'
              />
            </svg>
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '-0.01em',
              }}
            >
              Ambil Promo Sekarang
            </span>
            <svg width='20' height='20' viewBox='0 0 24 24' fill='none' aria-hidden>
              <path
                d='M5 12h14M13 6l6 6-6 6'
                stroke='currentColor'
                strokeWidth='3'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
          </button>

          <div style={{ marginTop: 14 }}>
            <Countdown />
          </div>

          {/* Secondary close — clearer dismiss path on mobile */}
          <button
            type='button'
            onClick={onClose}
            className='pf-promo-secondary-close'
          >
            Tutup, lihat-lihat dulu
          </button>
        </div>
      </div>

    </div>
  )
}

export default function LandingPromoBanner() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [promoPrice, setPromoPrice] = useState<number | null>(null)

  useBannerAssets()

  // Load plans and only open if lifetime is active and not dismissed this session
  useEffect(() => {
    let cancelled = false

    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return
    } catch {
      /* ignore */
    }

    if (Date.now() >= PROMO_END) return

    storeApi
      .getSubscriptionPlans()
      .then(data => {
        if (cancelled) return
        const lifetime = data.plans.find(p => p.plan === 'lifetime')

        if (lifetime && lifetime.price > 0) {
          setPromoPrice(lifetime.price)
          setOpen(true)
        }
      })
      .catch(() => {
        /* silent — just don't show */
      })

    
return () => {
      cancelled = true
    }
  }, [])

  // Esc to close
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }

    window.addEventListener('keydown', onKey)
    
return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Prevent body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    
return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const close = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* ignore */
    }

    setOpen(false)
  }

  const handleCta = () => {
    const amount = promoPrice ?? 0
    const priceText = formatIDR(amount)

    const message =
      `Halo admin Playfast! 🎮\n\n` +
      `Saya tertarik dengan promo *Subscribe Lifetime* (${priceText}) — akses semua 300+ game Steam.\n\n` +
      `Mohon info lebih lanjut untuk melanjutkan pembelian. Terima kasih!`

    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`

    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer')
    }

    close()

    // Soft redirect to subscribe page as a fallback path
    router.prefetch?.('/subscribe')
  }

  if (!open || promoPrice == null) return null

  return (
    <div onClick={close} className='pf-promo-overlay'>
      <div
        onClick={e => e.stopPropagation()}
        className='pf-promo-overlay-inner'
      >
        <BannerContent
          onClose={close}
          promoPrice={promoPrice}
          regularPrice={REGULAR_PRICE}
          onCtaClick={handleCta}
        />
      </div>
    </div>
  )
}
