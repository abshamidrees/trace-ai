'use client'

import { useState } from 'react'
import type { Wallet, RiskLevel } from '../lib/types'
import { shortenAddress } from '../lib/api'

const RISK_C: Record<RiskLevel,{ring:string;bg:string;text:string}> = {
  high:   { ring:'#ff4d6a', bg:'rgba(255,77,106,0.08)',  text:'#ff4d6a'  },
  medium: { ring:'#ffad3b', bg:'rgba(255,173,59,0.08)',  text:'#ffad3b'  },
  low:    { ring:'#36d399', bg:'rgba(54,211,153,0.08)',  text:'#36d399'  },
}

const CHAIN_COLOR: Record<string,string> = {
  ethereum:'#627eea', base:'#0052ff', arbitrum:'#12aaff',
  optimism:'#ff0420', polygon:'#8247e5', solana:'#9945ff',
  ton:'#0088cc', bitcoin:'#f7931a', unknown:'#475569',
}

const CHAIN_EXPLORER: Record<string,string> = {
  ethereum:'https://etherscan.io/address/', base:'https://basescan.org/address/',
  arbitrum:'https://arbiscan.io/address/',  optimism:'https://optimistic.etherscan.io/address/',
  polygon:'https://polygonscan.com/address/', solana:'https://solscan.io/account/',
  ton:'https://tonscan.org/address/', bitcoin:'https://mempool.space/address/',
}

function CopyBtn({ text }: { text:string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(()=>setOk(false),1200) }}
      className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost px-2 py-0.5 text-[10px]">
      {ok ? 'Copied' : 'copy'}
    </button>
  )
}

function WalletRow({ wallet, rank }: { wallet:Wallet; rank:number }) {
  const rc  = RISK_C[wallet.riskLevel]
  const cc  = CHAIN_COLOR[wallet.chain] || '#475569'
  const exp = CHAIN_EXPLORER[wallet.chain]

  return (
    <div className="group flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-white/[0.018]"
         style={{ border:'1px solid transparent' }}>
      <span className="font-mono text-[10px] w-4 text-right flex-shrink-0" style={{ color:'#2a2550' }}>{rank}</span>

      {/* Risk dot */}
      <span className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background:rc.ring, boxShadow:`0 0 6px ${rc.ring}` }}/>

      {/* Address */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11.5px]" style={{ color:'#94a3b8' }}>
            {shortenAddress(wallet.address, 6)}
          </span>
          <CopyBtn text={wallet.address}/>
          {wallet.label && (
            <span className="font-mono text-[9.5px] px-1.5 py-0.5 rounded truncate max-w-[140px]"
                  style={{ background:'rgba(127,90,240,0.1)', border:'1px solid rgba(127,90,240,0.22)', color:'#a78bfa' }}>
              {wallet.label}
            </span>
          )}
        </div>
        {wallet.tags && wallet.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {wallet.tags.map(t => (
              <span key={t} className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background:'#1e1b3a', color:'#475569' }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Chain badge */}
      <span className="chain-badge flex-shrink-0"
            style={{ background:`${cc}14`, border:`1px solid ${cc}30`, color:cc }}>
        {wallet.chain === 'ethereum' ? 'ETH' : wallet.chain === 'base' ? 'BASE' :
         wallet.chain === 'arbitrum' ? 'ARB' : wallet.chain === 'optimism' ? 'OP' :
         wallet.chain === 'polygon'  ? 'POLY': wallet.chain === 'solana' ? 'SOL' :
         wallet.chain === 'ton' ? 'TON' : wallet.chain === 'bitcoin' ? 'BTC' : '?'}
      </span>

      {/* Risk badge */}
      <span className="font-mono font-bold uppercase text-[9px] px-2 py-0.5 rounded flex-shrink-0"
            style={{ background:rc.bg, border:`1px solid ${rc.ring}30`, color:rc.ring }}>
        {wallet.riskLevel}
      </span>

      {/* Tx count */}
      <span className="font-mono text-[11px] flex-shrink-0 hidden sm:block" style={{ color:'#475569' }}>
        {wallet.txCount}
      </span>

      {/* Explorer */}
      {exp && (
        <a href={`${exp}${wallet.address}`} target="_blank" rel="noreferrer"
           onClick={e=>e.stopPropagation()}
           className="flex-shrink-0 transition-colors" style={{ color:'#2a2550' }}
           onMouseEnter={e=>(e.currentTarget.style.color='#7f5af0')}
           onMouseLeave={e=>(e.currentTarget.style.color='#2a2550')}>
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
        </a>
      )}
    </div>
  )
}

export default function WalletList({ wallets }: { wallets:Wallet[] }) {
  const [filter, setFilter] = useState<RiskLevel|'all'>('all')
  const [search, setSearch] = useState('')

  const filtered = wallets.filter(w => {
    if (filter !== 'all' && w.riskLevel !== filter) return false
    if (search && !w.address.toLowerCase().includes(search.toLowerCase())
               && !(w.label?.toLowerCase().includes(search.toLowerCase()))) return false
    return true
  })

  const counts = { high:0, medium:0, low:0 }
  wallets.forEach(w => counts[w.riskLevel]++)

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-5 py-4" style={{ borderBottom:'1px solid #1e1b3a' }}>
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-display font-bold text-white text-base">
            Connected Wallets
            <span className="font-mono font-normal text-[12px] ml-2" style={{ color:'#475569' }}>
              ({wallets.length})
            </span>
          </h2>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {([['all','All',wallets.length,'#7f5af0'],['high','High',counts.high,'#ff4d6a'],
             ['medium','Medium',counts.medium,'#ffad3b'],['low','Low',counts.low,'#36d399']] as const).map(
            ([val,label,count,col]) => (
              <button key={val} onClick={() => setFilter(val as RiskLevel|'all')}
                      className="font-mono text-[10px] px-3 py-1 rounded-full transition-all uppercase tracking-wider"
                      style={{
                        border: `1px solid ${filter===val ? col : '#2a2550'}`,
                        color:  filter===val ? col : '#475569',
                        background: filter===val ? `${col}10` : 'transparent',
                      }}>
                {label} ({count})
              </button>
          ))}
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
                 placeholder="Search..."
                 className="trace-input ml-auto !py-1.5 !px-3 !text-[11px] !rounded-lg !w-36 sm:!w-44"/>
        </div>
      </div>

      <div style={{ maxHeight:460, overflowY:'auto' }}>
        {filtered.length === 0
          ? <div className="text-center py-12 text-[13px]" style={{ color:'#475569' }}>No wallets match the filter.</div>
          : filtered.map((w,i) => <WalletRow key={w.address} wallet={w} rank={i+1}/>)
        }
      </div>
    </div>
  )
}
