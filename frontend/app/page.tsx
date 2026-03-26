'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { validateAddress, detectChain } from '../lib/api'

function HeroBG() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(127,90,240,0.07) 0%, transparent 68%)' }}
      />
      <div
        className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(45,212,191,0.05) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.035 }}>
        <defs>
          <pattern id="g" width="52" height="52" patternUnits="userSpaceOnUse">
            <path d="M 52 0 L 0 0 0 52" fill="none" stroke="#7f5af0" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
    </div>
  )
}

const FEATURES = [
  'Fund Flow Graph',
  'Sybil Detection',
  'TEE Verified AI',
  'Multi-Chain',
  'Bridge Tracking',
  'Risk Scoring',
]

const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'EVM', base: 'EVM', arbitrum: 'EVM', optimism: 'EVM',
  solana: 'SOL', ton: 'TON', bitcoin: 'BTC',
}

export default function HomePage() {
  const router  = useRouter()
  const [address, setAddress] = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)

  const chain      = address.trim() ? detectChain(address.trim()) : null
  const chainLabel = chain && chain !== 'unknown' ? CHAIN_LABELS[chain] || chain.toUpperCase() : null

  const handleAnalyze = useCallback(() => {
    const trimmed = address.trim()
    if (!trimmed)                  { setError('Paste a wallet address to get started.'); return }
    if (!validateAddress(trimmed)) { setError('Invalid address. Paste an EVM (0x…) or Solana address.'); return }
    setLoading(true)
    router.push(`/analyze/${encodeURIComponent(trimmed)}`)
  }, [address, router])

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-24 pb-14">
      <HeroBG />

      <div className="relative z-10 text-center max-w-4xl mx-auto">

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-[11px] mb-9 animate-fade-in"
          style={{
            background: 'rgba(127,90,240,0.08)',
            border: '1px solid rgba(127,90,240,0.22)',
            color: '#a78bfa',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#7f5af0' }} />
          Powered by OpenGradient — TEE-Verified AI
        </div>

        {/* Headline */}
        <h1
          className="font-display font-extrabold text-5xl sm:text-6xl md:text-7xl leading-[1.05] mb-5 animate-fade-up"
          style={{ animationDelay: '0.08s' }}
        >
          <span style={{ color: '#e2e8f0' }}>Trace the money.</span>
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg,#7f5af0 0%,#2dd4bf 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Expose the truth.
          </span>
        </h1>

        <p
          className="text-base md:text-lg max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-up"
          style={{ color: '#64748b', animationDelay: '0.18s' }}
        >
          Paste any wallet address to visualise fund flows, detect Sybil clusters,
          and receive AI-powered risk analysis — every result verified on-chain via TEE.
        </p>

        {/* Search */}
        <div className="max-w-2xl mx-auto animate-fade-up" style={{ animationDelay: '0.26s' }}>
          <div
            className="relative"
            style={{
              borderRadius: 14,
              boxShadow: focused
                ? '0 0 0 1px rgba(127,90,240,0.5), 0 0 50px rgba(127,90,240,0.18)'
                : 'none',
              transition: 'box-shadow 0.25s',
            }}
          >
            {/* Chain badge inside input */}
            {chainLabel && (
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                <span
                  className="chain-badge"
                  style={{
                    background: 'rgba(127,90,240,0.12)',
                    color: '#7f5af0',
                    border: '1px solid rgba(127,90,240,0.25)',
                  }}
                >
                  {chainLabel}
                </span>
              </div>
            )}

            <input
              type="text"
              value={address}
              onChange={e => { setAddress(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              onFocus={() => setFocused(true)}
              onBlur={()  => setFocused(false)}
              placeholder="Paste wallet address (ETH / Base / Solana / TON)…"
              className="trace-input pr-36"
              style={{ paddingLeft: chainLabel ? '72px' : '22px' }}
              spellCheck={false}
              autoComplete="off"
            />

            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="btn-primary absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2"
              style={{ fontSize: 13.5 }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading…
                </span>
              ) : 'Analyze'}
            </button>
          </div>

          {error && (
            <p className="mt-3 text-sm flex items-center gap-2 animate-fade-in" style={{ color: '#ff4d6a' }}>
              <svg className="flex-shrink-0" width="15" height="15" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
          )}
        </div>

        {/* Feature pills */}
        <div className="mt-14 flex flex-wrap justify-center gap-2.5 stagger animate-fade-up" style={{ animationDelay: '0.42s' }}>
          {FEATURES.map(f => (
            <div
              key={f}
              className="opacity-0 animate-fade-up px-4 py-2 rounded-full text-[13px]"
              style={{ background: 'rgba(30,27,58,0.7)', border: '1px solid #2a2550', color: '#64748b' }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div
        className="relative z-10 mt-20 w-full max-w-2xl mx-auto grid grid-cols-3 gap-4 animate-fade-up"
        style={{ animationDelay: '0.55s' }}
      >
        {[
          { value: '5M+',   label: 'Wallets Indexed'   },
          { value: '99.9%', label: 'TEE Uptime'        },
          { value: '< 15s', label: 'Avg Analysis Time' },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-5 text-center">
            <div className="font-display font-bold text-2xl mb-0.5" style={{ color: '#7f5af0' }}>{s.value}</div>
            <div className="text-[11.5px]" style={{ color: '#475569' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="relative z-10 mt-20 w-full max-w-4xl mx-auto">
        <h2
          className="text-center font-mono text-[10px] mb-8 uppercase tracking-widest"
          style={{ color: '#2a2550' }}
        >
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { step: '01', title: 'Paste any wallet',    body: 'ETH, Base, Arbitrum, Optimism, Solana. No wallet connection ever required.',                                             col: '#7f5af0' },
            { step: '02', title: 'AI traces the funds', body: 'OpenGradient runs Sybil detection inside a TEE. Every result is verifiable on-chain.',                                   col: '#2dd4bf' },
            { step: '03', title: 'Explore the graph',   body: 'Interactive fund-flow network reveals every connected wallet, bridge hop, and suspicious cluster.',                       col: '#a78bfa' },
          ].map(item => (
            <div key={item.step} className="glass rounded-xl p-6" style={{ borderColor: '#1e1b3a' }}>
              <div className="font-mono text-xs mb-3" style={{ color: item.col }}>{item.step}</div>
              <h3 className="font-display font-bold text-white mb-2 text-[15px]">{item.title}</h3>
              <p className="text-[13px] leading-relaxed" style={{ color: '#64748b' }}>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
