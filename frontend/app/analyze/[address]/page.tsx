'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { AnalysisResult, Chain, RiskLevel } from '../../../lib/types'
import { analyzeWallet, detectChain, shortenAddress } from '../../../lib/api'
import RiskCard    from '../../../components/RiskCard'
import ProofViewer from '../../../components/ProofViewer'
import WalletList  from '../../../components/WalletList'

const FundFlowGraph = dynamic(() => import('../../../components/FundFlowGraph'), { ssr: false })

// ── Palette ───────────────────────────────────────────────────────────────────
const RISK_COLOR: Record<RiskLevel,string> = {
  high:   '#ff4d6a',
  medium: '#ffad3b',
  low:    '#36d399',
}
const CHAIN_EXPLORER: Record<string,string> = {
  ethereum: 'https://etherscan.io/address/',
  base:     'https://basescan.org/address/',
  arbitrum: 'https://arbiscan.io/address/',
  optimism: 'https://optimistic.etherscan.io/address/',
  polygon:  'https://polygonscan.com/address/',
  solana:   'https://solscan.io/account/',
  ton:      'https://tonscan.org/address/',
  bitcoin:  'https://mempool.space/address/',
}
const TX_EXPLORER: Record<string,string> = {
  ethereum: 'https://etherscan.io/tx/',
  base:     'https://basescan.org/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  polygon:  'https://polygonscan.com/tx/',
  solana:   'https://solscan.io/tx/',
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="min-h-screen pt-20 pb-10 px-4 md:px-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="skeleton h-7 w-52 mb-3" />
        <div className="skeleton h-4 w-80" />
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 skeleton rounded-2xl" style={{ height: 520 }} />
        <div className="space-y-5">
          <div className="skeleton rounded-2xl" style={{ height: 280 }} />
          <div className="skeleton rounded-2xl" style={{ height: 200 }} />
        </div>
      </div>
      <div className="mt-5 skeleton rounded-2xl" style={{ height: 160 }} />
    </div>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text, label = 'copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(()=>setOk(false),1400) }}
      className="btn-ghost px-2.5 py-1 text-[11px]"
    >
      {ok ? 'Copied' : label}
    </button>
  )
}

// ── Transaction table ─────────────────────────────────────────────────────────
function TxTable({ txns }: { txns: AnalysisResult['recentTransactions'] }) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-6 py-4" style={{ borderBottom:'1px solid #1e1b3a' }}>
        <h2 className="font-display font-bold text-white text-base">Recent Transactions</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom:'1px solid #1e1b3a', color:'#475569', fontFamily:'Space Mono,monospace', fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              <th className="px-5 py-3 text-left">Hash</th>
              <th className="px-5 py-3 text-left">From</th>
              <th className="px-5 py-3 text-left">To</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3 text-right">USD</th>
              <th className="px-5 py-3 text-left">Chain</th>
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {txns.map(tx => (
              <tr key={tx.hash}
                  className="group hover:bg-white/[0.015] transition-colors"
                  style={{ borderBottom:'1px solid rgba(30,27,58,0.5)' }}>
                <td className="px-5 py-3 font-mono" style={{ color:'#7f5af0' }}>{shortenAddress(tx.hash, 4)}</td>
                <td className="px-5 py-3 font-mono" style={{ color:'#94a3b8' }}>{shortenAddress(tx.from, 5)}</td>
                <td className="px-5 py-3">
                  <span className="font-mono" style={{ color:'#94a3b8' }}>{shortenAddress(tx.to, 5)}</span>
                  {tx.bridgeProtocol && (
                    <span className="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded"
                          style={{ background:'rgba(127,90,240,0.12)', border:'1px solid rgba(127,90,240,0.25)', color:'#a78bfa' }}>
                      {tx.bridgeProtocol}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right font-mono" style={{ color:'#e2e8f0' }}>
                  {tx.amount} <span style={{ color:'#475569' }}>{tx.token}</span>
                </td>
                <td className="px-5 py-3 text-right font-mono" style={{ color:'#94a3b8' }}>
                  ${tx.amountUSD.toLocaleString()}
                </td>
                <td className="px-5 py-3 capitalize font-mono text-[11px]" style={{ color:'#64748b' }}>{tx.chain}</td>
                <td className="px-5 py-3" style={{ color:'#475569', fontFamily:'DM Sans,sans-serif', fontSize:11 }}>
                  {new Date(tx.timestamp).toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'})}
                </td>
                <td className="px-3 py-3">
                  <a href={`${TX_EXPLORER[tx.chain]||'https://etherscan.io/tx/'}${tx.hash}`}
                     target="_blank" rel="noreferrer"
                     className="opacity-0 group-hover:opacity-100 transition-opacity"
                     style={{ color:'#475569' }}
                     onMouseEnter={e=>(e.currentTarget.style.color='#7f5af0')}
                     onMouseLeave={e=>(e.currentTarget.style.color='#475569')}>
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyzePage() {
  const params  = useParams()
  const router  = useRouter()
  const address = decodeURIComponent(params.address as string)

  const [result,  setResult]  = useState<AnalysisResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const chain = detectChain(address)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    analyzeWallet(address).then(data => {
      if (!cancelled) { setResult(data); setLoading(false) }
    }).catch(err => {
      if (!cancelled) { setError(err.message); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [address])

  if (loading) return <Skeleton />

  if (error || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-2xl p-12 text-center max-w-md mx-4">
          <div className="font-display font-bold text-white text-xl mb-2">Analysis Failed</div>
          <p className="text-[13px] mb-6" style={{ color:'#64748b' }}>{error || 'Unknown error.'}</p>
          <button onClick={() => router.push('/')} className="btn-primary px-6 py-2.5 text-sm">
            Try another address
          </button>
        </div>
      </div>
    )
  }

  const riskC = RISK_COLOR[result.riskLevel]
  const explorerBase = CHAIN_EXPLORER[result.chain] || CHAIN_EXPLORER['ethereum']

  return (
    <div className="min-h-screen pt-20 pb-14 px-4 md:px-6 animate-fade-in">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <button onClick={() => router.push('/')}
                    className="btn-ghost px-3 py-1.5 text-[11px] mb-3 flex items-center gap-1.5">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
              New search
            </button>

            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="font-display font-bold text-white text-xl">Wallet Analysis</h1>
              {result.dataSource === 'demo' && (
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-full"
                      style={{ background:'rgba(255,173,59,0.09)', border:'1px solid rgba(255,173,59,0.28)', color:'#ffad3b' }}>
                  Demo Mode — set API keys for live data
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <code className="font-mono text-[13px] px-3 py-1.5 rounded-lg"
                    style={{ background:'rgba(127,90,240,0.08)', border:'1px solid rgba(127,90,240,0.2)', color:'#a78bfa' }}>
                {shortenAddress(address, 8)}
              </code>
              <CopyBtn text={address} label="copy full" />
              <a href={`${explorerBase}${address}`} target="_blank" rel="noreferrer"
                 className="btn-ghost px-2.5 py-1 text-[11px] flex items-center gap-1">
                explorer
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
              </a>
              <span className="chain-badge"
                    style={{
                      background: 'rgba(127,90,240,0.1)',
                      border:     '1px solid rgba(127,90,240,0.22)',
                      color:      '#a78bfa',
                    }}>
                {result.chain.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Risk summary pill */}
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl flex-shrink-0"
               style={{ background: `${riskC}0d`, border:`1px solid ${riskC}30` }}>
            <div>
              <div className="font-display font-black text-3xl leading-none" style={{ color: riskC }}>
                {result.riskScore}
              </div>
              <div className="font-mono text-[10px] mt-0.5" style={{ color: riskC, opacity:0.7 }}>/100 RISK</div>
            </div>
            <div style={{ width:1, height:36, background:`${riskC}30` }} />
            <div>
              <div className="font-mono font-bold text-[11px] uppercase tracking-widest" style={{ color: riskC }}>
                {result.riskLevel} risk
              </div>
              <div className="font-mono text-[11px] mt-0.5" style={{ color:'#475569' }}>
                {Math.round(result.sybilProbability * 100)}% sybil prob.
              </div>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid lg:grid-cols-3 gap-5">

          {/* Graph — full height, 2 cols */}
          <div className="lg:col-span-2 glass rounded-2xl overflow-hidden" style={{ height: 540 }}>
            <FundFlowGraph data={result.graph} />
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            <RiskCard result={result} />
          </div>
        </div>

        {/* Wallets + Proof */}
        <div className="grid lg:grid-cols-3 gap-5 mt-5">
          <div className="lg:col-span-2">
            <WalletList wallets={result.connectedWallets} />
          </div>
          <div>
            <ProofViewer proof={result.proof} />
          </div>
        </div>

        {/* Transactions */}
        <div className="mt-5">
          <TxTable txns={result.recentTransactions} />
        </div>

        {/* Share */}
        <div className="mt-8 flex flex-wrap gap-2.5 justify-center">
          {[
            { label:'Copy report link', action:()=>navigator.clipboard.writeText(window.location.href) },
            { label:'Share on X',       action:()=>window.open(`https://twitter.com/intent/tweet?text=Traced+${shortenAddress(address)}+with+TraceAI+—+Risk:+${result.riskLevel.toUpperCase()}+${result.riskScore}/100+%23OpenGradient`) },
            { label:'Print report',     action:()=>window.print() },
          ].map(b => (
            <button key={b.label} onClick={b.action} className="btn-ghost px-5 py-2.5 text-[13px]">{b.label}</button>
          ))}
        </div>

      </div>
    </div>
  )
}
