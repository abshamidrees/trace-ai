'use client'

import { useState } from 'react'
import type { OGProof } from '../lib/types'
import { shortenAddress } from '../lib/api'

function highlight(json: string) {
  return json
    .replace(/"([^"]+)":/g, '<span class="key">"$1":</span>')
    .replace(/: "([^"]+)"/g, ': <span class="str">"$1"</span>')
    .replace(/: (\d+)/g, ': <span class="num">$1</span>')
}

function CopyBtn({ text }: { text:string }) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(()=>setOk(false),1400) }}
            className="btn-ghost px-2.5 py-1 text-[10px]">
      {ok ? 'Copied' : 'Copy'}
    </button>
  )
}

function Row({ label, value, link, mono=false }: { label:string; value:string; link?:string; mono?:boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom:'1px solid #1e1b3a' }}>
      <span className="text-[11px] flex-shrink-0 w-32" style={{ color:'#475569', fontFamily:'DM Sans,sans-serif' }}>{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer"
             className={`truncate max-w-[210px] transition-colors ${mono ? 'font-mono text-[10.5px]' : 'text-[12px]'}`}
             style={{ color:'#7f5af0' }}
             onMouseEnter={e=>(e.currentTarget.style.color='#a78bfa')}
             onMouseLeave={e=>(e.currentTarget.style.color='#7f5af0')}>
            {value}
          </a>
        ) : (
          <span className={`truncate max-w-[210px] ${mono ? 'font-mono text-[10.5px]' : 'text-[12px]'}`}
                style={{ color:'#94a3b8' }}>
            {value}
          </span>
        )}
        <CopyBtn text={value}/>
      </div>
    </div>
  )
}

export default function ProofViewer({ proof }: { proof:OGProof }) {
  const [open, setOpen] = useState(false)
  const ogUrl = `https://explorer.opengradient.ai/workflow/${proof.workflowAddress}`

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom:'1px solid #1e1b3a' }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
               style={{ background:'rgba(127,90,240,0.12)', border:'1px solid rgba(127,90,240,0.25)' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#7f5af0" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 013 10c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.347-.2-2.65-.598-3.872A11.96 11.96 0 0015 6z"/>
            </svg>
          </div>
          <div>
            <h2 className="font-display font-bold text-white text-[13.5px]">OpenGradient TEE Proof</h2>
            <p className="font-mono text-[10px]" style={{ color:'#475569' }}>Verifiable on-chain AI execution</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
             style={{ background:'rgba(54,211,153,0.08)', border:'1px solid rgba(54,211,153,0.2)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background:'#36d399' }}/>
          <span className="font-mono text-[10px]" style={{ color:'#36d399' }}>Verified</span>
        </div>
      </div>

      <div className="px-5 py-1">
        <Row label="Workflow Contract" value={shortenAddress(proof.workflowAddress, 8)} link={ogUrl} mono/>
        <Row label="Execution Tx"      value={shortenAddress(proof.executionTxHash, 8)}
             link={`https://explorer.opengradient.ai/tx/${proof.executionTxHash}`} mono/>
        <Row label="Model ID"          value={proof.modelId} mono/>
        <Row label="TEE Provider"      value={proof.teeProvider}/>
        <Row label="Input Hash"        value={shortenAddress(proof.inputHash, 8)} mono/>
        <Row label="Output Hash"       value={shortenAddress(proof.outputHash, 8)} mono/>
        <Row label="Executed At"       value={new Date(proof.timestamp).toLocaleString()}/>
      </div>

      {/* Toggle raw proof */}
      <div className="px-5 pb-5">
        <button onClick={() => setOpen(v => !v)}
                className="btn-ghost w-full py-2.5 mt-2 flex items-center justify-center gap-2 text-[12px]">
          <svg className={`transition-transform ${open ? 'rotate-180' : ''}`} width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
          </svg>
          {open ? 'Hide' : 'View'} Raw Proof JSON
        </button>
        {open && proof.rawProof && (
          <div className="mt-3 animate-fade-in">
            <div className="proof-json" dangerouslySetInnerHTML={{ __html: highlight(JSON.stringify(proof.rawProof, null, 2)) }}/>
          </div>
        )}
      </div>

      {/* Explainer */}
      <div className="mx-5 mb-5 p-3 rounded-lg" style={{ background:'rgba(127,90,240,0.05)', border:'1px solid rgba(127,90,240,0.12)' }}>
        <p className="text-[11px] leading-relaxed" style={{ color:'#64748b' }}>
          <span style={{ color:'#7f5af0', fontWeight:500 }}>What this means: </span>
          The Sybil detection and risk score ran inside a Trusted Execution Environment on OpenGradient.
          The on-chain proof guarantees the model executed correctly and output was not tampered with.
          Verify independently using the workflow address above.
        </p>
      </div>
    </div>
  )
}
